// Only dormant 006 application-owned state. Never identities, credentials,
// mappings, progress or monotonic epoch/retirement authorities. No scheduler.
// Receipt-first locking matches mint/refresh/signout; busy work is skipped.
export async function reapBoundReturnState(database){
  let db,broken=false;
  try{
    db=await database.connect();
    await db.query('begin');
    await db.query("set local lock_timeout='75ms'");
    await db.query("set local statement_timeout='500ms'");
    const {rows}=await db.query(`select a.state_hash from oz_identity.pixel_link_attempts a
      where a.expires_at<clock_timestamp()-interval '5 minutes'
      order by a.expires_at,a.state_hash limit 32 for update of a skip locked`);
    if(!rows.length){await db.query('commit');return {deferred:false,requests:0,sessions:0,attempts:0};}
    const states=rows.map(row=>row.state_hash);
    // A consumed proof may be referenced by a final mint/refresh fence. Only
    // retire it AFTER its original request deadline plus a full minute, never
    // while it could admit a session. Bound each child deletion independently.
    const requests=await db.query(`delete from oz_identity.pixel_status_requests where request_jti in
      (select q.request_jti from oz_identity.pixel_status_requests q
        where q.attempt_state_hash=any($1::text[])
          and q.request_expires<clock_timestamp()-interval '1 minute'
        order by q.request_expires,q.request_jti limit 128 for update of q skip locked)`,[states]);
    const sessions=await db.query(`delete from oz_identity.pixel_sessions where token_hash in
      (select s.token_hash from oz_identity.pixel_sessions s
        where s.login_attempt_state_hash=any($1::text[]) and s.expires_at<clock_timestamp()
          and (s.upstream_until is null or s.upstream_until<clock_timestamp())
        order by s.expires_at,s.token_hash limit 32 for update of s skip locked)`,[states]);
    const attempts=await db.query(`delete from oz_identity.pixel_link_attempts a
      where a.state_hash=any($1::text[]) and a.expires_at<clock_timestamp()-interval '5 minutes'
        and not exists(select 1 from oz_identity.pixel_sessions s where s.login_attempt_state_hash=a.state_hash)
        and not exists(select 1 from oz_identity.pixel_status_requests q where q.attempt_state_hash=a.state_hash)`,[states]);
    await db.query('commit');
    return {deferred:false,requests:requests.rowCount,sessions:sessions.rowCount,attempts:attempts.rowCount};
  }catch{
    // Opportunistic bounded maintenance must neither reject a valid return
    // nor mint/extend authority. A later return can retry the expired batch.
    if(db)try{await db.query('rollback');}catch{broken=true;}
    return {deferred:true,requests:0,sessions:0,attempts:0};
  }finally{if(db)db.release(broken);}
}

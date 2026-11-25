-- classes_since_test is only used inside the parent functions (security definer).
revoke execute on function classes_since_test(uuid) from authenticated;
grant execute on function classes_since_test(uuid) to service_role;

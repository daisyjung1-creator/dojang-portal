-- Expands the belt list to the full striped progression used by the dojang.
alter table students alter column belt set default 'White';
-- No data migration needed yet (0 student rows as of this writing), but if
-- any exist with the old simplified belt names, map them forward:
update students set belt = 'White' where belt = 'White Belt';
update students set belt = 'Yellow' where belt = 'Yellow Belt';
update students set belt = 'Green' where belt = 'Green Belt';
update students set belt = 'Blue' where belt = 'Blue Belt';
update students set belt = 'Red' where belt = 'Red Belt';
update students set belt = 'Black Belt 1st Dan' where belt = 'Black Belt';

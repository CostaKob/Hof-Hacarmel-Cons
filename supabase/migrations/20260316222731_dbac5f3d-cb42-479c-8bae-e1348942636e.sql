DELETE FROM report_lines WHERE report_id IN (SELECT id FROM reports WHERE teacher_id = '97cd078d-c50c-4fba-9bac-f5c84693c5e7');
DELETE FROM reports WHERE teacher_id = '97cd078d-c50c-4fba-9bac-f5c84693c5e7';
DELETE FROM teachers WHERE id = '97cd078d-c50c-4fba-9bac-f5c84693c5e7';
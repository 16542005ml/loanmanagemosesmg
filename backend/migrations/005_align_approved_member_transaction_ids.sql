-- Transaction member IDs use approved_members IDs after approval.
ALTER TABLE contributions DROP FOREIGN KEY contributions_ibfk_1;
ALTER TABLE expense_claims DROP FOREIGN KEY expense_claims_ibfk_1;
ALTER TABLE loans DROP FOREIGN KEY loans_ibfk_1;
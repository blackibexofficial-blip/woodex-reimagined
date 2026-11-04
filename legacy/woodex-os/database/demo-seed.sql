-- STAGING/DEMO ONLY. Do not import into production.
-- Admin: demo@woodex.com / Demo@12345!
-- Frontend: customer-demo@woodex.com / Demo@12345!
INSERT INTO wx_users (name,email,role,pass_hash,active,pw_ver,created_at) VALUES ('Demo Admin','demo@woodex.com','admin','$2y$10$Y8PQVI6Ff66qdkuuGcokx.Q9RJdf.Gq2PIWv4zAFPWRDxRx.KOrhG',1,1,NOW()) ON DUPLICATE KEY UPDATE name=VALUES(name),role='admin',pass_hash=VALUES(pass_hash),active=1,pw_ver=pw_ver+1;
INSERT INTO wx_frontend_users (name,email,phone,pass_hash,active,created_at) VALUES ('Demo Customer','customer-demo@woodex.com','+92 300 0000000','$2y$10$58PB0./OPeQAA5S49mk.SuqUlg4zHirSyzHbzhlNlZXlJL/9NNdcO',1,NOW()) ON DUPLICATE KEY UPDATE name=VALUES(name),phone=VALUES(phone),pass_hash=VALUES(pass_hash),active=1;

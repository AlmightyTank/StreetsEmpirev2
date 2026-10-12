-- 1.6.5-D. Loan shark events in the player's activity history: a loan taken, a payment
-- (scheduled or manual), and a missed installment, which also reaches the bell.
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'LOAN_TAKEN';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'LOAN_PAYMENT';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'LOAN_INSTALLMENT_MISSED';

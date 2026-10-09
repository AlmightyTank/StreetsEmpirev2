-- 1.6.0-H. A lane shipment landing is news: clean, partly searched, or seized.
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'SUPPLY_LANE_ARRIVED';

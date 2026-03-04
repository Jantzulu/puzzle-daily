-- Migration: Publishing Pipeline
-- Adds UPDATE/DELETE policies to live tables so dev tool can unpublish and update live data.
-- Run this in Supabase SQL Editor.

-- Allow dev tool to update puzzles in live table
CREATE POLICY "Allow update to puzzles_live" ON puzzles_live
  FOR UPDATE USING (true) WITH CHECK (true);

-- Allow dev tool to delete (unpublish) puzzles from live table
CREATE POLICY "Allow delete from puzzles_live" ON puzzles_live
  FOR DELETE USING (true);

-- Allow dev tool to update assets in live table
CREATE POLICY "Allow update to assets_live" ON assets_live
  FOR UPDATE USING (true) WITH CHECK (true);

-- Allow dev tool to delete (unpublish) assets from live table
CREATE POLICY "Allow delete from assets_live" ON assets_live
  FOR DELETE USING (true);

-- Allow dev tool to update daily schedule
CREATE POLICY "Allow update to daily_schedule" ON daily_schedule
  FOR UPDATE USING (true) WITH CHECK (true);

-- Allow dev tool to delete from daily schedule (unschedule)
CREATE POLICY "Allow delete from daily_schedule" ON daily_schedule
  FOR DELETE USING (true);

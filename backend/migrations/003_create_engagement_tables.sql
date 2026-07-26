-- 003: Engagement & Motivation tables
-- member_checkins: daily check-in streaks
CREATE TABLE IF NOT EXISTS member_checkins (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  member_id INT UNSIGNED NOT NULL,
  checkin_date DATE NOT NULL,
  streak_count INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_checkin_member_date (member_id, checkin_date),
  INDEX idx_checkins_member (member_id)
);

-- member_badges: earned achievements
CREATE TABLE IF NOT EXISTS member_badges (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  member_id INT UNSIGNED NOT NULL,
  badge_key VARCHAR(60) NOT NULL,
  badge_label VARCHAR(120) NOT NULL DEFAULT '',
  earned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_badge_member_key (member_id, badge_key),
  INDEX idx_badges_member (member_id)
);

-- savings_goals: personal savings targets
CREATE TABLE IF NOT EXISTS savings_goals (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  member_id INT UNSIGNED NOT NULL,
  target_amount DECIMAL(18,2) NOT NULL,
  target_date DATE DEFAULT NULL,
  goal_label VARCHAR(150) NOT NULL DEFAULT 'Savings Goal',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_savings_goals_member (member_id)
);

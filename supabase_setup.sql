-- 机器人资产管理系统 - Supabase 建表脚本
-- 在 Supabase 控制台的 SQL Editor 中执行此脚本

-- 0. 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. 创建机器人表
CREATE TABLE IF NOT EXISTS robots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,                              -- 机器人类型
  serial TEXT NOT NULL,                            -- 出厂编号
  status TEXT NOT NULL DEFAULT '测试中',            -- 状态：已出库/测试中/借出中/返修中
  person TEXT,                                     -- 关联责任人
  ip TEXT,                                         -- IP 地址
  location TEXT,                                   -- 当前位置
  notes TEXT,                                      -- 备注/历史记录
  borrowed BOOLEAN DEFAULT FALSE,                  -- 是否借出
  borrowed_to TEXT,                                -- 借用人
  borrowed_at TIMESTAMPTZ,                         -- 借出时间
  return_due TIMESTAMPTZ,                          -- 预计归还时间
  image TEXT,                                      -- 相关图片
  updater TEXT,                                    -- 最后更新人
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(type, serial)                             -- 类型+编号唯一
);

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_robots_serial ON robots(serial);
CREATE INDEX IF NOT EXISTS idx_robots_type ON robots(type);
CREATE INDEX IF NOT EXISTS idx_robots_status ON robots(status);
CREATE INDEX IF NOT EXISTS idx_robots_location ON robots(location);

-- 3. 启用 Row Level Security (允许所有人读写，适合内部工具)
ALTER TABLE robots ENABLE ROW LEVEL SECURITY;

-- 允许匿名用户读取
CREATE POLICY "Allow anonymous read" ON robots
  FOR SELECT USING (true);

-- 允许匿名用户插入
CREATE POLICY "Allow anonymous insert" ON robots
  FOR INSERT WITH CHECK (true);

-- 允许匿名用户更新
CREATE POLICY "Allow anonymous update" ON robots
  FOR UPDATE USING (true);

-- 允许匿名用户删除
CREATE POLICY "Allow anonymous delete" ON robots
  FOR DELETE USING (true);

-- 5. 盘点记录表
CREATE TABLE IF NOT EXISTS inventory_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  robot_id UUID NOT NULL REFERENCES robots(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'confirmed',  -- confirmed / missing
  checked_by TEXT,                            -- 盘点人
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id TEXT,                            -- 同一次盘点的会话 ID
  UNIQUE(robot_id, session_id)               -- 同一会话内同一台机器人只能有一条记录
);

CREATE INDEX IF NOT EXISTS idx_inv_robot ON inventory_checks(robot_id);
CREATE INDEX IF NOT EXISTS idx_inv_session ON inventory_checks(session_id);

ALTER TABLE inventory_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read" ON inventory_checks
  FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert" ON inventory_checks
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update" ON inventory_checks
  FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete" ON inventory_checks
  FOR DELETE USING (true);

-- 6. 变更记录表
CREATE TABLE IF NOT EXISTS change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  robot_id UUID NOT NULL REFERENCES robots(id) ON DELETE CASCADE,
  field TEXT NOT NULL,                          -- 变更的字段名
  old_value TEXT,                               -- 旧值
  new_value TEXT,                               -- 新值
  changed_by TEXT,                              -- 操作人
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_changelog_robot ON change_log(robot_id);
CREATE INDEX IF NOT EXISTS idx_changelog_time ON change_log(changed_at);

ALTER TABLE change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read" ON change_log
  FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert" ON change_log
  FOR INSERT WITH CHECK (true);

-- 4. 自动更新 updated_at 字段
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON robots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

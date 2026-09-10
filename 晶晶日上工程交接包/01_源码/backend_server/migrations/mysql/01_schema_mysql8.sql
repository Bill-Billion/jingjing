-- 晶晶日上 MySQL 8.0 建库脚本（由 scripts/gen_mysql_schema.js 自动翻译 + 人工校对）
-- 金额一律 BIGINT 整数分；字符集 utf8mb4；引擎 InnoDB。结构脚本；数据用 db_export/import。
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE schema_migrations (
  version VARCHAR(191) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(255),
  applied_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  openid VARCHAR(191) UNIQUE,
  unionid VARCHAR(255),
  apple_sub VARCHAR(191) UNIQUE,          -- Sign in with Apple 唯一标识
  nickname VARCHAR(255),
  avatar VARCHAR(512),
  phone VARCHAR(191) UNIQUE,
  role VARCHAR(255) DEFAULT 'user',       -- user | talent | mcn | admin
  is_auth BIGINT DEFAULT 0,
  is_talent BIGINT DEFAULT 0,
  status VARCHAR(255) DEFAULT 'active',   -- active | banned
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE humans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  user_id BIGINT,
  name VARCHAR(255) NOT NULL,
  avatar VARCHAR(512),
  tags VARCHAR(255),
  style VARCHAR(255),
  specialty VARCHAR(255),
  heat DOUBLE DEFAULT 0,
  sales BIGINT DEFAULT 0,
  service_fee BIGINT DEFAULT 0,      -- 分
  province VARCHAR(255), city TEXT, district TEXT,
  lat DOUBLE, lng REAL,             -- 经纬度（LBS同城查询）
  price BIGINT DEFAULT 9900,     -- 分（99元起，艺人自定价）
  wechat VARCHAR(255), phone TEXT, email TEXT,
  contact_mode VARCHAR(255) DEFAULT 'apply', -- direct(购买后直接可见) | apply(购买后可申请，艺人同意)
  level VARCHAR(255) DEFAULT 'B级',
  schedule VARCHAR(255) DEFAULT '可约',
  films BIGINT DEFAULT 0,
  status VARCHAR(255) DEFAULT 'pending',  -- pending(待审核) | active | rejected | banned
  reject_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  , showreel_urls TEXT, verified_level TEXT DEFAULT "none", quality_grade TEXT DEFAULT "B", subsidy_until DATETIME, is_new_talent INTEGER DEFAULT 0)

CREATE TABLE authorization_agreements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  user_id BIGINT NOT NULL,
  human_id BIGINT NOT NULL,
  scope VARCHAR(255) NOT NULL,            -- display | video | voice | endorsement | film
  scope_range TEXT,               -- 授权范围描述（肖像/声音分别列明）
  platform_share DOUBLE DEFAULT 0.10,
  expire_at DATETIME,             -- NULL 表示长期有效
  signed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip VARCHAR(255),
  device VARCHAR(512),
  liveness_txn_id VARCHAR(255),           -- 活体检测流水号
  copyright_agreed BIGINT DEFAULT 0, -- V4.0 是否同意版权归属条款
  voice_authorized BIGINT DEFAULT 0, -- V4.0 声音授权（独立于肖像）
  status VARCHAR(255) DEFAULT 'active',   -- active | revoked
  revoked_at DATETIME,
  version VARCHAR(255) DEFAULT '2.0'
  , license_term_months INTEGER DEFAULT 36)

CREATE TABLE talent_deposits (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  user_id BIGINT NOT NULL UNIQUE,
  human_id BIGINT NOT NULL,
  required_amount BIGINT NOT NULL,   -- 当前应缴保证金（分）
  paid_amount BIGINT DEFAULT 0,      -- 已缴金额（分）
  monthly_revenue BIGINT DEFAULT 0,  -- 近30天成交额（分）
  complaint_rate DOUBLE DEFAULT 0,      -- 近30天投诉率
  refund_rate DOUBLE DEFAULT 0,         -- 近30天退款率
  status VARCHAR(255) DEFAULT 'pending',      -- pending(待缴纳) | active | withdrawing | refunded
  paid_at DATETIME,
  last_adjusted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  , collection_mode TEXT DEFAULT "first_income")

CREATE TABLE face_materials (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  user_id BIGINT NOT NULL,
  human_id BIGINT NOT NULL,
  feature_vector LONGBLOB,            -- AES-256加密的人脸特征向量
  vector_hash VARCHAR(255),               -- 特征向量SHA-256哈希（去重/校验）
  oss_path VARCHAR(512),                  -- OSS私有Bucket路径（如存训练素材）
  oss_cdn_auth_expire BIGINT DEFAULT 3600,
  liveness_txn_id VARCHAR(255),           -- 活体检测流水号
  liveness_verified BIGINT DEFAULT 0,
  consent_id BIGINT,             -- 关联user_consents记录
  encryption_key_id VARCHAR(255),         -- KMS密钥ID
  status VARCHAR(255) DEFAULT 'active',   -- active | deleted
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME             -- 撤回授权后180天删除
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE user_consents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  user_id BIGINT NOT NULL,
  consent_type VARCHAR(255) NOT NULL,     -- privacy | biometric | copyright | digital_goods_return
                                    -- | minor_guardian | algorithm_personalization | platform_rules
  consent_version VARCHAR(255) NOT NULL,  -- 协议版本号
  consented BIGINT DEFAULT 1,    -- 1=同意 0=拒绝
  consent_text TEXT,              -- 同意时的具体文本快照
  order_no VARCHAR(255),                  -- 关联订单（如退货确认）
  ip VARCHAR(255),
  device VARCHAR(512),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE abnormal_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  event_type VARCHAR(255) NOT NULL,       -- contact_exchange | high_complaint | high_refund
                                    -- | velocity_order | self_deal | offline_solicit
  severity VARCHAR(255) DEFAULT 'low',    -- low | medium | high | critical
  user_id BIGINT,
  human_id BIGINT,
  conversation_id BIGINT,
  order_no VARCHAR(255),
  description TEXT,
  metadata TEXT,                  -- JSON
  action_taken VARCHAR(255),              -- warning | restrict_im | freeze_withdraw | manual_review
  action_by VARCHAR(255),                 -- auto | admin_id
  resolved BIGINT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE minor_profiles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  user_id BIGINT NOT NULL UNIQUE,
  birth_date DATE,
  age_verified BIGINT DEFAULT 0,
  guardian_consent BIGINT DEFAULT 0,
  guardian_phone VARCHAR(255),
  guardian_verified BIGINT DEFAULT 0,
  monthly_spent BIGINT DEFAULT 0,   -- 当月累计消费（分）
  monthly_reset_at DATETIME,
  teen_mode_enabled BIGINT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE video_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  talent_id BIGINT,
  title VARCHAR(255), category TEXT, duration INTEGER,
  price BIGINT,                  -- 分
  sold BIGINT DEFAULT 0,
  description TEXT,
  preview_url VARCHAR(512),
  status VARCHAR(255) DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE video_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  order_no VARCHAR(191) UNIQUE,
  user_id BIGINT,
  talent_id BIGINT,
  template_id BIGINT,
  recipient VARCHAR(255), message TEXT, email TEXT,
  amount BIGINT,                 -- 分
  platform_fee BIGINT DEFAULT 0,
  ai_cost BIGINT DEFAULT 0,
  tax_amount BIGINT DEFAULT 0,
  tax_rate DOUBLE DEFAULT 0,
  net_amount BIGINT DEFAULT 0,
  identity_type VARCHAR(255) DEFAULT 'personal',
  status VARCHAR(255) DEFAULT 'pending',
    -- pending(待支付) → paid(已支付/待接单) → delivering(制作中)
    -- → delivered(待验收) → completed(已完成/已结算)
    -- → dispute(纠纷中) → refunded(已退款) | cancelled(已取消)
  settle_status VARCHAR(255) DEFAULT 'unsettled',
  settle_time DATETIME,
  pay_time DATETIME, accept_time DATETIME,
  deliver_time DATETIME, verify_deadline DATETIME,
  complete_time DATETIME,
  video_url VARCHAR(512),
  review_status VARCHAR(255) DEFAULT 'pending', -- pending | approved | rejected
  review_remark TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  , redo_count INTEGER DEFAULT 0, redo_available INTEGER DEFAULT 1, scene_template_id INTEGER, after_sales_status TEXT)

CREATE TABLE payment_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  tx_no VARCHAR(191) UNIQUE,              -- 平台流水号
  order_no VARCHAR(255) NOT NULL,         -- 业务订单号
  order_type VARCHAR(255) NOT NULL,       -- video | endorsement | customization | sample
  channel VARCHAR(255) NOT NULL,          -- wechat | alipay | mock
  channel_txn_no VARCHAR(255),            -- 第三方流水号
  amount BIGINT NOT NULL,        -- 分
  status VARCHAR(255) DEFAULT 'pending',  -- pending | success | failed | closed | refunded
  pay_url VARCHAR(512),
  callback_raw TEXT,
  callback_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  , refunded_amount INTEGER DEFAULT 0)

CREATE TABLE refunds (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  refund_no VARCHAR(191) UNIQUE,
  order_no VARCHAR(255) NOT NULL,
  order_type VARCHAR(255) NOT NULL,
  payment_tx_no VARCHAR(255),
  amount BIGINT NOT NULL,
  reason TEXT,
  status VARCHAR(255) DEFAULT 'pending',  -- pending | approved | processing | success | rejected
  channel_refund_no VARCHAR(255),
  operator_id BIGINT,
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME
  , refund_kind TEXT DEFAULT "full", channel_status TEXT, idem_key TEXT)

CREATE TABLE projects (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  title VARCHAR(255), cover TEXT, type TEXT,  -- 短剧 | 中剧 | 电影
  intro TEXT, plan_url TEXT,
  talent_id BIGINT,
  goal_amount BIGINT,            -- 分
  raised_amount BIGINT DEFAULT 0,
  client_count BIGINT DEFAULT 0,
  status VARCHAR(255) DEFAULT 'pending',
    -- pending(审核中) | recruiting(认领中) | success(成团) | failed(未成团)
    -- | refunding(退款中) | preparing(筹备中) | producing(制作中)
    -- | post(后期中) | delivered(成片交付) | closed(已完结)
  start_date DATETIME,
  end_date DATETIME,              -- 定制剧截止
  service_rate DOUBLE DEFAULT 0.05,
  escrow_account VARCHAR(255),            -- 存管账户标识
  deposit_amount BIGINT DEFAULT 0, -- 项目方保证金（分）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  , fast_group_bonus INTEGER DEFAULT 0)

CREATE TABLE project_roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  project_id BIGINT,
  name VARCHAR(255),
  price BIGINT,                  -- 分
  rights TEXT,
  stock_total BIGINT DEFAULT 1,  -- 该档位名额
  stock_sold BIGINT DEFAULT 0,
    UNIQUE(project_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE claims (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  order_no VARCHAR(191) UNIQUE,
  user_id BIGINT,
  project_id BIGINT,
  role_id BIGINT,
  role_name VARCHAR(255),
  amount BIGINT,                 -- 分
  rights TEXT,
  payment_tx_no VARCHAR(255),
  status VARCHAR(255) DEFAULT 'pending',  -- pending(待支付) | paid(已支付)
                                    -- | signed(已签约) | refunded(已退款)
  service_fee BIGINT DEFAULT 0,      -- 平台服务费（分）
  service_fee_status VARCHAR(255) DEFAULT 'none', -- none | paid
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE project_milestones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  project_id BIGINT,
  name VARCHAR(255),
  ratio DOUBLE,
  amount BIGINT,
  status VARCHAR(255) DEFAULT 'pending',  -- pending | released
  released_at DATETIME,
  proof_url VARCHAR(512)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE project_updates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  project_id BIGINT,
  title VARCHAR(255), content TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE theaters (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  title VARCHAR(255), cover TEXT, intro TEXT,
  plan_url VARCHAR(512), status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE lotteries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  project_id BIGINT, theater_id INTEGER,
  title VARCHAR(255), prize TEXT, conditions TEXT,
  end_date DATE, joined_count INTEGER DEFAULT 0,
  status VARCHAR(255) DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE lottery_signups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  lottery_id BIGINT, user_id INTEGER, talent_id INTEGER,
  is_winner BIGINT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lottery_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE endorsement_tasks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  order_no VARCHAR(191) UNIQUE, user_id INTEGER, talent_id INTEGER,
  title VARCHAR(255), brand TEXT, category TEXT,
  requirements TEXT, duration INTEGER,
  budget BIGINT,                 -- 分
  status VARCHAR(255) DEFAULT 'open',     -- open | quoted | in_progress | delivered | completed | cancelled
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE endorsement_applications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  task_id BIGINT, talent_id INTEGER,
  quote BIGINT, message TEXT,
  status VARCHAR(255) DEFAULT 'pending'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE endorsement_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  order_no VARCHAR(191) UNIQUE, task_id INTEGER,
  user_id BIGINT, talent_id INTEGER,
  title VARCHAR(255), brand TEXT, category TEXT, requirements TEXT,
  amount BIGINT, platform_fee INTEGER, ai_cost INTEGER,
  tax_amount BIGINT, net_amount INTEGER,
  identity_type VARCHAR(255) DEFAULT 'personal',
  status VARCHAR(255) DEFAULT 'pending',
  settle_status VARCHAR(255) DEFAULT 'unsettled',
  settle_time DATETIME, pay_time DATETIME,
  accept_time DATETIME, deliver_time DATETIME, verify_deadline DATETIME,
  video_url VARCHAR(512), material_urls TEXT,
  review_status VARCHAR(255) DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  , is_ad INTEGER DEFAULT 1, auth_letter_url TEXT, tax_rate REAL DEFAULT 0)

CREATE TABLE sample_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  order_no VARCHAR(191) UNIQUE, user_id INTEGER, human_id INTEGER,
  script_id BIGINT,
  amount BIGINT DEFAULT 500000,  -- V6.0: 基础档5000元（分）
  cost_amount BIGINT DEFAULT 150000, -- AI+人工+编剧成本约1500元
  intent_amount BIGINT DEFAULT 100000,  -- V6.0: 意向金1000元
  production_fee BIGINT DEFAULT 400000, -- V6.0: 制作款4000元
  intent_paid BIGINT DEFAULT 0,         -- 意向金是否已付
  production_paid BIGINT DEFAULT 0,     -- 制作款是否已付
  status VARCHAR(255) DEFAULT 'draft',  -- V6.0: draft|intent_paid|genre_selected|reference_picked|scripting|script_finalized|production_paid|producing|delivered|completed|cancelled
  step BIGINT DEFAULT 0,       -- V6.0: 当前步骤0-6
  genre VARCHAR(255),                   -- V6.0: 选定类型（古装逆袭等）
  reference_script_id BIGINT,  -- V6.0: 选定的对标剧本ID
  script_title TEXT,            -- V6.0: 剧本标题
  script_outline TEXT,          -- V6.0: 故事大纲
  script_characters TEXT,       -- V6.0: 人物设定（JSON）
  script_draft TEXT,            -- V6.0: 剧本初稿
  script_final TEXT,            -- V6.0: 定稿剧本
  script_status TEXT DEFAULT 'pending', -- V6.0: pending|writing|draft_ready|revising|finalized
  revision_count BIGINT DEFAULT 0,      -- V6.0: 已用修改轮次
  script_feedback TEXT,         -- V6.0: 修改意见（JSON数组）
  sample_url VARCHAR(512), proposal_url TEXT,
  preview_url VARCHAR(512),             -- V6.0: 成片预览URL
  redo_count BIGINT DEFAULT 0, -- V6.0: 成片修改次数
  project_id BIGINT,
  contact_name VARCHAR(255), contact_phone TEXT, -- V6.0: 联系方式
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  , prepay_amount INTEGER DEFAULT 0, preview_status TEXT, preview_deadline DATETIME, pay_time DATETIME)

CREATE TABLE sample_library (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  genre VARCHAR(255) NOT NULL,           -- 类型：古装逆袭/都市甜宠/悬疑推理/玄幻修仙/家庭伦理等
  title VARCHAR(255) NOT NULL,           -- 对标剧名/剧本标题
  outline TEXT NOT NULL,         -- 故事大纲
  characters TEXT,               -- 人物设定（JSON数组）
  tags VARCHAR(255),                     -- 标签（JSON数组）
  market_data VARCHAR(255),              -- 市场数据（JSON：热度/评分/同类票房等）
  heat_score BIGINT DEFAULT 0,  -- 热度分
  cover_url VARCHAR(512),                -- 封面图
  sort_order BIGINT DEFAULT 0,
  status VARCHAR(255) DEFAULT 'active',  -- active | inactive
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE custom_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  user_id BIGINT,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(255) NOT NULL,
  genre VARCHAR(255),                    -- 类型
  format VARCHAR(255),                   -- 电影/中剧/短剧/网络大电影
  budget_min BIGINT,            -- 预算下限（分）
  budget_max BIGINT,            -- 预算上限（分）
  special_requirements TEXT,     -- 特殊需求（金牌编剧/知名导演/明星参演等）
  description TEXT,              -- 详细描述
  status VARCHAR(255) DEFAULT 'new',     -- new | contacted | negotiating | signed | lost
  handler_id BIGINT,            -- 商务跟进人
  handler_note VARCHAR(255),             -- 跟进备注
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE wallets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  user_id BIGINT UNIQUE,
  balance BIGINT DEFAULT 0,      -- 可提现余额（分）
  frozen BIGINT DEFAULT 0,       -- 冻结中（提现审核/纠纷）
  pending BIGINT DEFAULT 0,      -- 待结算（担保中）
  total_income BIGINT DEFAULT 0,
  total_withdrawn BIGINT DEFAULT 0,
  bank_card VARCHAR(255),                 -- AES加密存储
  alipay_account VARCHAR(255),
  id_verified BIGINT DEFAULT 0,  -- 实名认证+四要素验证
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  tx_no VARCHAR(191) UNIQUE,
  user_id BIGINT,
  type VARCHAR(255),                      -- income | withdraw | refund | adjustment
  amount BIGINT,                 -- 分（正入负出）
  balance_after BIGINT,
  order_type VARCHAR(255), order_id INTEGER,
  description TEXT,
  status VARCHAR(255) DEFAULT 'done',     -- done | pending | failed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE withdrawals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  withdraw_no VARCHAR(191) UNIQUE,
  user_id BIGINT,
  amount BIGINT, fee INTEGER,
  channel VARCHAR(255),                   -- bank | alipay
  account VARCHAR(255),                   -- 脱敏
  status VARCHAR(255) DEFAULT 'pending',  -- pending | reviewing | approved | paying | success | rejected
  risk_score DOUBLE DEFAULT 0,
  reviewer_id BIGINT,
  reject_reason TEXT,
  channel_txn_no VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE mcn_agencies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  user_id BIGINT, name TEXT NOT NULL,
  license_url VARCHAR(512), contact_name TEXT, contact_phone TEXT,
  commission_rate DOUBLE DEFAULT 10,
  status VARCHAR(255) DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  , free_until DATETIME)

CREATE TABLE mcn_talents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  mcn_id BIGINT, talent_id INTEGER,
  talent_share DOUBLE DEFAULT 70,
  status VARCHAR(255) DEFAULT 'active',
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(mcn_id, talent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE user_identities (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  user_id BIGINT UNIQUE,
  identity_type VARCHAR(255) NOT NULL,    -- personal | company | mcn
  real_name VARCHAR(255), id_card TEXT,   -- AES加密
  company_name VARCHAR(255), credit_code TEXT,
  license_url VARCHAR(512), mcn_id INTEGER,
  status VARCHAR(255) DEFAULT 'pending',  -- pending | approved | rejected
  reject_reason TEXT,
  liveness_verified BIGINT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  , updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)

CREATE TABLE content_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  content_type TEXT NOT NULL,     -- video | endorsement | project | comment | human
  content_id BIGINT NOT NULL,
  submitter_id BIGINT,
  machine_result VARCHAR(255),            -- pass | reject | review
  machine_score DOUBLE,
  human_result VARCHAR(255),              -- pass | reject
  reviewer_id BIGINT,
  reason TEXT,
  status VARCHAR(255) DEFAULT 'pending',  -- pending | machine_done | approved | rejected
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  operator_id BIGINT,
  operator_role VARCHAR(255),
  action VARCHAR(255) NOT NULL,           -- login | pay | settle | withdraw_approve | ban | config_change
  target_type VARCHAR(255), target_id TEXT,
  detail TEXT,                    -- JSON
  ip VARCHAR(255), user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  reporter_id BIGINT,
  target_type VARCHAR(255), target_id INTEGER,
  reason TEXT, description TEXT,
  status VARCHAR(255) DEFAULT 'pending',  -- pending | processing | resolved | rejected
  handler_id BIGINT, reply TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE conversations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  user_id BIGINT NOT NULL,          -- 买家
  talent_user_id BIGINT NOT NULL,   -- 艺人所属用户
  human_id BIGINT NOT NULL,         -- 数字人ID
  order_no VARCHAR(255),                     -- 关联订单号（首条消息需有订单关系）
  last_message TEXT,
  last_message_at DATETIME,
  user_unread BIGINT DEFAULT 0,
  talent_unread BIGINT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, human_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  conversation_id BIGINT NOT NULL,
  sender_id BIGINT NOT NULL,
  receiver_id BIGINT NOT NULL,
  content TEXT NOT NULL,
  msg_type VARCHAR(255) DEFAULT 'text',      -- text | image | order_card | system
  is_read BIGINT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE admins (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  username VARCHAR(191) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(255) DEFAULT 'operator',   -- super | finance | auditor | operator
  status VARCHAR(255) DEFAULT 'active',
  last_login DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE launch_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  user_id BIGINT, name TEXT NOT NULL, phone TEXT NOT NULL,
  talent_name VARCHAR(255), description TEXT, budget TEXT,
  status VARCHAR(255) DEFAULT '待联系',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE audition_applications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  user_id BIGINT, name TEXT NOT NULL, style TEXT,
  description TEXT, phone TEXT NOT NULL,
  status VARCHAR(255) DEFAULT '审核中',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE scene_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  name VARCHAR(255) NOT NULL,              -- 模板名称
  category VARCHAR(255) NOT NULL,          -- 分类：wedding/annual/graduation/valentine/birthday/festival/opening/custom
  icon VARCHAR(255),                       -- 图标标识
  suggested_price BIGINT DEFAULT 9900,  -- 推荐价格（分）
  suggested_duration BIGINT DEFAULT 15, -- 推荐时长（秒）
  default_message TEXT,            -- 默认祝福语模板
  description TEXT,                -- 模板描述
  preview_url VARCHAR(512),                -- 示例视频URL
  sort_order BIGINT DEFAULT 0,
  status VARCHAR(255) DEFAULT 'active',    -- active | inactive
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE order_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  order_no VARCHAR(255) NOT NULL,
  order_type VARCHAR(255) NOT NULL,        -- video | endorsement
  user_id BIGINT NOT NULL,        -- 评价人（买家）
  talent_id BIGINT NOT NULL,      -- 被评价艺人
  quality_rating BIGINT NOT NULL, -- 视频质量 1-5
  speed_rating BIGINT NOT NULL,   -- 交付速度 1-5
  service_rating BIGINT NOT NULL, -- 服务态度 1-5
  accuracy_rating BIGINT NOT NULL,-- 符合描述 1-5
  overall_rating DOUBLE NOT NULL,    -- 综合评分（加权平均）
  content TEXT,                    -- 文字评价
  images VARCHAR(255),                     -- JSON数组：评价图片URL
  talent_reply TEXT,               -- 艺人回复
  talent_replied_at DATETIME,
  status VARCHAR(255) DEFAULT 'active',    -- active | hidden
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(order_no, order_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE share_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  user_id BIGINT NOT NULL,        -- 分享人
  order_no VARCHAR(255),                   -- 关联订单
  share_channel VARCHAR(255),              -- wechat_moments/wechat_friend/weibo/xiaohongshu/douyin
  share_poster_url VARCHAR(512),           -- 生成的分享海报URL
  invitee_user_id BIGINT,         -- 被邀请注册用户ID
  reward_amount BIGINT DEFAULT 0, -- 奖励金额（分）
  reward_status VARCHAR(255) DEFAULT 'pending', -- pending | rewarded | expired
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE coupons (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  user_id BIGINT NOT NULL,
  amount BIGINT NOT NULL,         -- 面额（分）
  min_spend BIGINT DEFAULT 0,     -- 最低消费门槛（分）
  coupon_type VARCHAR(255) DEFAULT 'cash', -- cash | discount
  source VARCHAR(255) DEFAULT 'share',     -- share | first_order | admin_grant
  status VARCHAR(255) DEFAULT 'unused',    -- unused | used | expired
  order_no VARCHAR(255),                   -- 使用的订单号
  valid_from DATETIME DEFAULT CURRENT_TIMESTAMP,
  valid_until DATETIME,
  used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE consent_steps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  user_id BIGINT NOT NULL,
  human_id BIGINT,
  step VARCHAR(255) NOT NULL,              -- photo_upload | liveness | scope_select | confirm
  consent_text TEXT NOT NULL,      -- 该步骤展示的授权文本快照
  consented BIGINT DEFAULT 1,
  ip VARCHAR(255),
  device VARCHAR(512),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE talent_promotions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  user_id BIGINT NOT NULL,
  human_id BIGINT NOT NULL,
  promotion_type VARCHAR(255) NOT NULL,    -- ai_subsidy | commission_free | traffic_boost
  start_date DATETIME NOT NULL,
  end_date DATETIME NOT NULL,
  benefits TEXT,                   -- JSON：具体权益描述
  status VARCHAR(255) DEFAULT 'active',    -- active | expired | terminated
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE scriptwriters (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  user_id BIGINT NOT NULL,
  real_name VARCHAR(255),
  pen_name VARCHAR(255),
  id_card VARCHAR(255),                    -- AES加密
  bio VARCHAR(255),                        -- 编剧经历
  works VARCHAR(255),                      -- 代表作品JSON
  status VARCHAR(255) DEFAULT 'pending',   -- pending | approved | rejected
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE scripts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  scriptwriter_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(255),                   -- 短剧/中剧/电影
  genre VARCHAR(255),                      -- 类型
  word_count BIGINT,
  synopsis VARCHAR(255),
  file_url VARCHAR(512),                   -- 剧本文件（加密存储）
  filing_number VARCHAR(255),              -- 剧本备案号
  evidence_hash VARCHAR(255),              -- 时间戳存证哈希
  evidence_txid VARCHAR(255),              -- 区块链存证交易ID
  status VARCHAR(255) DEFAULT 'pending',   -- pending | approved | adopted | rejected
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE endorsement_metrics (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  order_no VARCHAR(255) NOT NULL,
  platform VARCHAR(255) NOT NULL,          -- douyin/xiaohongshu/weibo/wechat/offline
  views BIGINT DEFAULT 0,
  likes BIGINT DEFAULT 0,
  comments BIGINT DEFAULT 0,
  shares BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE after_sales_timeline (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  order_no VARCHAR(255) NOT NULL,
  order_type VARCHAR(255) NOT NULL,
  action VARCHAR(255) NOT NULL,            -- apply | accept | processing | redo | refund_approve | refund_success | reject
  operator_role VARCHAR(255),              -- user | talent | platform
  operator_id BIGINT,
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE packages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  name VARCHAR(255) NOT NULL,
  price BIGINT NOT NULL,          -- 套餐价格（分）
  video_count BIGINT NOT NULL,    -- 包含视频数量
  validity_months BIGINT DEFAULT 12,
  description TEXT,
  benefits TEXT,                   -- JSON：权益列表
  status VARCHAR(255) DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE user_packages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  user_id BIGINT NOT NULL,
  package_id BIGINT NOT NULL,
  order_no VARCHAR(255),
  total_count BIGINT NOT NULL,
  used_count BIGINT DEFAULT 0,
  start_date DATETIME,
  end_date DATETIME,
  status VARCHAR(255) DEFAULT 'active',    -- active | expired | used_up
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE idempotent_keys (
  idempotent_key VARCHAR(191) PRIMARY KEY,
  response VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sms_verification_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  phone VARCHAR(255) NOT NULL,
  purpose VARCHAR(255) NOT NULL DEFAULT 'login',   -- login | bind | notify
  code_hash VARCHAR(255) NOT NULL,                 -- 只存 SHA256 哈希，不落明文
  expires_at BIGINT NOT NULL,             -- epoch ms，5 分钟有效
  consumed BIGINT NOT NULL DEFAULT 0,     -- 0 未用 1 已用（一次性）
  fail_count BIGINT NOT NULL DEFAULT 0,   -- 连续输错次数
  locked_until BIGINT NOT NULL DEFAULT 0, -- 失败超限锁定到该时刻
  send_ip VARCHAR(255),
  provider_msg_id VARCHAR(255),
  created_at BIGINT NOT NULL,
  consumed_at BIGINT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE ai_generation_tasks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  task_type VARCHAR(255) NOT NULL,                 -- seedream_t2i | seedance_t2v | seedance_i2v | tts | voice_clone
  upstream_id VARCHAR(255),                        -- 方舟异步任务ID
  user_id BIGINT,
  status VARCHAR(255) NOT NULL DEFAULT 'pending',  -- pending | running | succeeded | failed
  model VARCHAR(255),
  request_json TEXT,
  result_url VARCHAR(512),                         -- 转存后的相对 URL（/uploads/...）
  result_meta VARCHAR(255),
  error VARCHAR(255),
  retry_count BIGINT NOT NULL DEFAULT 0,
  cost_fen DOUBLE NOT NULL DEFAULT 0,
  usage_json TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  finished_at BIGINT
  , deliverable_status TEXT DEFAULT "approved", version_no INTEGER DEFAULT 1, parent_task_id INTEGER, review_reason TEXT)

CREATE TABLE ai_cost_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  created_at BIGINT NOT NULL,
  svc VARCHAR(255) NOT NULL,                       -- ark | openspeech | sms
  action VARCHAR(255) NOT NULL,
  model VARCHAR(255),
  user_id BIGINT,
  ok BIGINT NOT NULL DEFAULT 1,
  http_code BIGINT,
  billed_units DOUBLE NOT NULL DEFAULT 0,    -- 计费量（字符/张/秒/条/token）
  unit VARCHAR(255),
  est_cost_fen DOUBLE NOT NULL DEFAULT 0,
  request_id VARCHAR(255),
  meta VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE contact_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  requester_id BIGINT NOT NULL,      -- 申请人（买家）
  human_id BIGINT NOT NULL,
  talent_user_id BIGINT NOT NULL,    -- 艺人所属用户
  order_no VARCHAR(255),
  message TEXT,
  platform_disclaimer BIGINT DEFAULT 1, -- 已确认平台免责声明
  status VARCHAR(255) DEFAULT 'pending',      -- pending | approved | rejected
  contact_shared VARCHAR(255),                -- 同意后加密/JSON 存放的联系方式
  handled_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  pay_no VARCHAR(191) UNIQUE NOT NULL,       -- 平台支付单号（幂等键之一）
  order_no VARCHAR(255) NOT NULL,            -- 业务订单号
  biz_type VARCHAR(255) NOT NULL,            -- video | sample | endorsement | dream(定制剧席位)
  stage VARCHAR(255) NOT NULL DEFAULT '',    -- sample 分期：intent(意向金)|production(制作款)；其它业务为 ''
  amount_fen BIGINT NOT NULL,       -- 金额（分），服务端订单/config 决定，绝不信前端
  status VARCHAR(255) NOT NULL DEFAULT 'pending', -- pending(待支付) | paid(已支付) | closed(已关闭) | refunded(已退款)
  channel VARCHAR(255) NOT NULL DEFAULT 'alipay', -- 支付渠道，本期 alipay
  trade_no VARCHAR(255),                     -- 支付宝交易流水号（回调/查单回填）
  buyer_id BIGINT,                  -- 下单用户 id
  subject VARCHAR(255),                      -- 订单标题
  order_string VARCHAR(255),                 -- APP 端唤起支付宝用的待签订单串
  notify_hash VARCHAR(255),                  -- 异步通知原文 SHA256（回调幂等去重）
  paid_at DATETIME,                  -- 支付成功时间
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  , refunded_amount_fen INTEGER DEFAULT 0)

CREATE TABLE reconciliation_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  run_date VARCHAR(255) NOT NULL,
  scope VARCHAR(255) NOT NULL DEFAULT 'daily',      -- daily | manual
  order_book BIGINT NOT NULL DEFAULT 0,    -- 订单应收（分）
  pay_book BIGINT NOT NULL DEFAULT 0,      -- 支付实收（分）
  refund_book BIGINT NOT NULL DEFAULT 0,   -- 已退（分）
  settle_book BIGINT NOT NULL DEFAULT 0,   -- 已结/待结给艺人/MCN（分）
  platform_book BIGINT NOT NULL DEFAULT 0, -- 平台收入（分）
  fee_tax_book BIGINT NOT NULL DEFAULT 0,  -- 渠道费/税费（分）
  diff_count BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(255) NOT NULL DEFAULT 'balanced',  -- balanced | diff
  detail TEXT,                              -- JSON 差异明细
  created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE deliverable_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY  ,
  task_id BIGINT NOT NULL,
  version_no BIGINT NOT NULL DEFAULT 1,
  result_url VARCHAR(512),
  result_meta VARCHAR(255),
  reason TEXT,                              -- 重做/重生成原因
  source VARCHAR(255) NOT NULL DEFAULT 'poll',      -- poll | webhook | manual
  review_status VARCHAR(255) NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  review_reason TEXT,
  reviewer_id BIGINT,
  reviewed_at BIGINT,
  created_at BIGINT NOT NULL,
        UNIQUE(task_id, version_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_humans_region ON humans(province, city, district);
CREATE INDEX idx_humans_heat ON humans(heat DESC);
CREATE INDEX idx_humans_status ON humans(status);
CREATE INDEX idx_video_orders_user ON video_orders(user_id);
CREATE INDEX idx_video_orders_talent ON video_orders(talent_id);
CREATE INDEX idx_video_orders_status ON video_orders(status);
CREATE INDEX idx_video_orders_settle ON video_orders(settle_status);
CREATE INDEX idx_payment_order ON payment_transactions(order_no);
CREATE INDEX idx_payment_channel ON payment_transactions(channel_txn_no);
CREATE INDEX idx_payment_status ON payment_transactions(status);
CREATE INDEX idx_refunds_order ON refunds(order_no);
CREATE INDEX idx_claims_user ON claims(user_id);
CREATE INDEX idx_claims_project ON claims(project_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_wallets_user ON wallets(user_id);
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_withdrawals_status ON withdrawals(status);
CREATE INDEX idx_reviews_status ON content_reviews(status);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_auth_user ON authorization_agreements(user_id, human_id);
CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_talent ON conversations(talent_user_id);
CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at);
CREATE INDEX idx_humans_location ON humans(lat, lng);
CREATE INDEX idx_deposits_user ON talent_deposits(user_id);
CREATE INDEX idx_deposits_status ON talent_deposits(status);
CREATE INDEX idx_face_user ON face_materials(user_id, human_id);
CREATE INDEX idx_consents_user ON user_consents(user_id, consent_type);
CREATE INDEX idx_abnormal_user ON abnormal_events(user_id, event_type);
CREATE INDEX idx_abnormal_severity ON abnormal_events(severity, resolved);
CREATE INDEX idx_abnormal_created ON abnormal_events(created_at);
CREATE INDEX idx_minor_user ON minor_profiles(user_id);
CREATE INDEX idx_scene_tpl_category ON scene_templates(category, status);
CREATE INDEX idx_order_reviews_talent ON order_reviews(talent_id, status);
CREATE INDEX idx_order_reviews_order ON order_reviews(order_no);
CREATE INDEX idx_share_records_user ON share_records(user_id);
CREATE INDEX idx_share_records_invitee ON share_records(invitee_user_id);
CREATE INDEX idx_coupons_user ON coupons(user_id, status);
CREATE INDEX idx_consent_steps_user ON consent_steps(user_id, human_id);
CREATE INDEX idx_promotions_user ON talent_promotions(user_id, status);
CREATE INDEX idx_scripts_writer ON scripts(scriptwriter_id, status);
CREATE INDEX idx_endo_metrics_order ON endorsement_metrics(order_no);
CREATE INDEX idx_after_sales_order ON after_sales_timeline(order_no);
CREATE INDEX idx_user_packages_user ON user_packages(user_id, status);
CREATE INDEX idx_sample_library_genre ON sample_library(genre, status);
CREATE INDEX idx_sample_library_heat ON sample_library(heat_score DESC);
CREATE INDEX idx_sample_orders_user ON sample_orders(user_id);
CREATE INDEX idx_sample_orders_status ON sample_orders(status);
CREATE INDEX idx_custom_requests_status ON custom_requests(status);
CREATE INDEX idx_sms_code_phone ON sms_verification_codes(phone, purpose, created_at DESC);
CREATE INDEX idx_ai_task_status ON ai_generation_tasks(status);
CREATE INDEX idx_ai_task_upstream ON ai_generation_tasks(upstream_id);
CREATE INDEX idx_ai_task_user ON ai_generation_tasks(user_id, created_at DESC);
CREATE INDEX idx_ai_cost_day ON ai_cost_log(created_at);
CREATE INDEX idx_contact_requester ON contact_requests(requester_id);
CREATE INDEX idx_contact_talent ON contact_requests(talent_user_id, status);
CREATE INDEX idx_payments_order ON payments(order_no, stage);
CREATE INDEX idx_payments_biz_status ON payments(biz_type, status);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_buyer ON payments(buyer_id, created_at DESC);
CREATE INDEX idx_payments_trade ON payments(trade_no);
-- [需人工方案] SQLite 部分唯一索引，MySQL 用生成列实现，见 README_mysql_switch.md
-- 原始: CREATE UNIQUE INDEX idx_payments_one_pending ON payments(order_no, stage) WHERE status = 'pending'
CREATE INDEX idx_recon_date ON reconciliation_runs(run_date);
CREATE INDEX idx_deliver_task ON deliverable_versions(task_id, version_no);
CREATE INDEX idx_deliver_review ON deliverable_versions(review_status);

SET FOREIGN_KEY_CHECKS=1;

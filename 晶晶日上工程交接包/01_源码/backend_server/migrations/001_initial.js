// 001_initial.js - 基线结构（由改造前 db.js 反解生成，等于 V12.4 时点全新库结构）
// 金额一律 INTEGER 分；本迁移只描述结构，不含业务数据。
module.exports = {
  version: 1,
  name: 'initial_schema_v12_4',
  up(db) {
    db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    openid TEXT UNIQUE,
    unionid TEXT,
    apple_sub TEXT UNIQUE,          -- Sign in with Apple 唯一标识
    nickname TEXT,
    avatar TEXT,
    phone TEXT UNIQUE,
    role TEXT DEFAULT 'user',       -- user | talent | mcn | admin
    is_auth INTEGER DEFAULT 0,
    is_talent INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',   -- active | banned
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS humans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT NOT NULL,
    avatar TEXT,
    tags TEXT,
    style TEXT,
    specialty TEXT,
    heat REAL DEFAULT 0,
    sales INTEGER DEFAULT 0,
    service_fee INTEGER DEFAULT 0,      -- 分
    province TEXT, city TEXT, district TEXT,
    lat REAL, lng REAL,             -- 经纬度（LBS同城查询）
    price INTEGER DEFAULT 9900,     -- 分（99元起，艺人自定价）
    wechat TEXT, phone TEXT, email TEXT,
    contact_mode TEXT DEFAULT 'apply', -- direct(购买后直接可见) | apply(购买后可申请，艺人同意)
    level TEXT DEFAULT 'B级',
    schedule TEXT DEFAULT '可约',
    films INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',  -- pending(待审核) | active | rejected | banned
    reject_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  , showreel_urls TEXT, verified_level TEXT DEFAULT "none", quality_grade TEXT DEFAULT "B", subsidy_until DATETIME, is_new_talent INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS authorization_agreements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    human_id INTEGER NOT NULL,
    scope TEXT NOT NULL,            -- display | video | voice | endorsement | film
    scope_range TEXT,               -- 授权范围描述（肖像/声音分别列明）
    platform_share REAL DEFAULT 0.10,
    expire_at DATETIME,             -- NULL 表示长期有效
    signed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip TEXT,
    device TEXT,
    liveness_txn_id TEXT,           -- 活体检测流水号
    copyright_agreed INTEGER DEFAULT 0, -- V4.0 是否同意版权归属条款
    voice_authorized INTEGER DEFAULT 0, -- V4.0 声音授权（独立于肖像）
    status TEXT DEFAULT 'active',   -- active | revoked
    revoked_at DATETIME,
    version TEXT DEFAULT '2.0'
  , license_term_months INTEGER DEFAULT 36);
CREATE TABLE IF NOT EXISTS talent_deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    human_id INTEGER NOT NULL,
    required_amount INTEGER NOT NULL,   -- 当前应缴保证金（分）
    paid_amount INTEGER DEFAULT 0,      -- 已缴金额（分）
    monthly_revenue INTEGER DEFAULT 0,  -- 近30天成交额（分）
    complaint_rate REAL DEFAULT 0,      -- 近30天投诉率
    refund_rate REAL DEFAULT 0,         -- 近30天退款率
    status TEXT DEFAULT 'pending',      -- pending(待缴纳) | active | withdrawing | refunded
    paid_at DATETIME,
    last_adjusted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  , collection_mode TEXT DEFAULT "first_income");
CREATE TABLE IF NOT EXISTS face_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    human_id INTEGER NOT NULL,
    feature_vector BLOB,            -- AES-256加密的人脸特征向量
    vector_hash TEXT,               -- 特征向量SHA-256哈希（去重/校验）
    oss_path TEXT,                  -- OSS私有Bucket路径（如存训练素材）
    oss_cdn_auth_expire INTEGER DEFAULT 3600,
    liveness_txn_id TEXT,           -- 活体检测流水号
    liveness_verified INTEGER DEFAULT 0,
    consent_id INTEGER,             -- 关联user_consents记录
    encryption_key_id TEXT,         -- KMS密钥ID
    status TEXT DEFAULT 'active',   -- active | deleted
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME             -- 撤回授权后180天删除
  );
CREATE TABLE IF NOT EXISTS user_consents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    consent_type TEXT NOT NULL,     -- privacy | biometric | copyright | digital_goods_return
                                    -- | minor_guardian | algorithm_personalization | platform_rules
    consent_version TEXT NOT NULL,  -- 协议版本号
    consented INTEGER DEFAULT 1,    -- 1=同意 0=拒绝
    consent_text TEXT,              -- 同意时的具体文本快照
    order_no TEXT,                  -- 关联订单（如退货确认）
    ip TEXT,
    device TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS abnormal_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,       -- contact_exchange | high_complaint | high_refund
                                    -- | velocity_order | self_deal | offline_solicit
    severity TEXT DEFAULT 'low',    -- low | medium | high | critical
    user_id INTEGER,
    human_id INTEGER,
    conversation_id INTEGER,
    order_no TEXT,
    description TEXT,
    metadata TEXT,                  -- JSON
    action_taken TEXT,              -- warning | restrict_im | freeze_withdraw | manual_review
    action_by TEXT,                 -- auto | admin_id
    resolved INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
  );
CREATE TABLE IF NOT EXISTS minor_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    birth_date DATE,
    age_verified INTEGER DEFAULT 0,
    guardian_consent INTEGER DEFAULT 0,
    guardian_phone TEXT,
    guardian_verified INTEGER DEFAULT 0,
    monthly_spent INTEGER DEFAULT 0,   -- 当月累计消费（分）
    monthly_reset_at DATETIME,
    teen_mode_enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS video_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    talent_id INTEGER,
    title TEXT, category TEXT, duration INTEGER,
    price INTEGER,                  -- 分
    sold INTEGER DEFAULT 0,
    description TEXT,
    preview_url TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS video_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT UNIQUE,
    user_id INTEGER,
    talent_id INTEGER,
    template_id INTEGER,
    recipient TEXT, message TEXT, email TEXT,
    amount INTEGER,                 -- 分
    platform_fee INTEGER DEFAULT 0,
    ai_cost INTEGER DEFAULT 0,
    tax_amount INTEGER DEFAULT 0,
    tax_rate REAL DEFAULT 0,
    net_amount INTEGER DEFAULT 0,
    identity_type TEXT DEFAULT 'personal',
    status TEXT DEFAULT 'pending',
    -- pending(待支付) → paid(已支付/待接单) → delivering(制作中)
    -- → delivered(待验收) → completed(已完成/已结算)
    -- → dispute(纠纷中) → refunded(已退款) | cancelled(已取消)
    settle_status TEXT DEFAULT 'unsettled',
    settle_time DATETIME,
    pay_time DATETIME, accept_time DATETIME,
    deliver_time DATETIME, verify_deadline DATETIME,
    complete_time DATETIME,
    video_url TEXT,
    review_status TEXT DEFAULT 'pending', -- pending | approved | rejected
    review_remark TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  , redo_count INTEGER DEFAULT 0, redo_available INTEGER DEFAULT 1, scene_template_id INTEGER, after_sales_status TEXT);
CREATE TABLE IF NOT EXISTS payment_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_no TEXT UNIQUE,              -- 平台流水号
    order_no TEXT NOT NULL,         -- 业务订单号
    order_type TEXT NOT NULL,       -- video | endorsement | customization | sample
    channel TEXT NOT NULL,          -- wechat | alipay | mock
    channel_txn_no TEXT,            -- 第三方流水号
    amount INTEGER NOT NULL,        -- 分
    status TEXT DEFAULT 'pending',  -- pending | success | failed | closed | refunded
    pay_url TEXT,
    callback_raw TEXT,
    callback_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS refunds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    refund_no TEXT UNIQUE,
    order_no TEXT NOT NULL,
    order_type TEXT NOT NULL,
    payment_tx_no TEXT,
    amount INTEGER NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending',  -- pending | approved | processing | success | rejected
    channel_refund_no TEXT,
    operator_id INTEGER,
    remark TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME
  );
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT, cover TEXT, type TEXT,  -- 短剧 | 中剧 | 电影
    intro TEXT, plan_url TEXT,
    talent_id INTEGER,
    goal_amount INTEGER,            -- 分
    raised_amount INTEGER DEFAULT 0,
    client_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    -- pending(审核中) | recruiting(认领中) | success(成团) | failed(未成团)
    -- | refunding(退款中) | preparing(筹备中) | producing(制作中)
    -- | post(后期中) | delivered(成片交付) | closed(已完结)
    start_date DATETIME,
    end_date DATETIME,              -- 定制剧截止
    service_rate REAL DEFAULT 0.05,
    escrow_account TEXT,            -- 存管账户标识
    deposit_amount INTEGER DEFAULT 0, -- 项目方保证金（分）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  , fast_group_bonus INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS project_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    name TEXT,
    price INTEGER,                  -- 分
    rights TEXT,
    stock_total INTEGER DEFAULT 1,  -- 该档位名额
    stock_sold INTEGER DEFAULT 0,
    UNIQUE(project_id, name)
  );
CREATE TABLE IF NOT EXISTS claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT UNIQUE,
    user_id INTEGER,
    project_id INTEGER,
    role_id INTEGER,
    role_name TEXT,
    amount INTEGER,                 -- 分
    rights TEXT,
    payment_tx_no TEXT,
    status TEXT DEFAULT 'pending',  -- pending(待支付) | paid(已支付)
                                    -- | signed(已签约) | refunded(已退款)
    service_fee INTEGER DEFAULT 0,      -- 平台服务费（分）
    service_fee_status TEXT DEFAULT 'none', -- none | paid
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS project_milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    name TEXT,
    ratio REAL,
    amount INTEGER,
    status TEXT DEFAULT 'pending',  -- pending | released
    released_at DATETIME,
    proof_url TEXT
  );
CREATE TABLE IF NOT EXISTS project_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    title TEXT, content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS theaters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT, cover TEXT, intro TEXT,
    plan_url TEXT, status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS lotteries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER, theater_id INTEGER,
    title TEXT, prize TEXT, conditions TEXT,
    end_date DATE, joined_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active'
  );
CREATE TABLE IF NOT EXISTS lottery_signups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lottery_id INTEGER, user_id INTEGER, talent_id INTEGER,
    is_winner INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lottery_id, user_id)
  );
CREATE TABLE IF NOT EXISTS endorsement_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT UNIQUE, user_id INTEGER, talent_id INTEGER,
    title TEXT, brand TEXT, category TEXT,
    requirements TEXT, duration INTEGER,
    budget INTEGER,                 -- 分
    status TEXT DEFAULT 'open',     -- open | quoted | in_progress | delivered | completed | cancelled
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS endorsement_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER, talent_id INTEGER,
    quote INTEGER, message TEXT,
    status TEXT DEFAULT 'pending'
  );
CREATE TABLE IF NOT EXISTS endorsement_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT UNIQUE, task_id INTEGER,
    user_id INTEGER, talent_id INTEGER,
    title TEXT, brand TEXT, category TEXT, requirements TEXT,
    amount INTEGER, platform_fee INTEGER, ai_cost INTEGER,
    tax_amount INTEGER, net_amount INTEGER,
    identity_type TEXT DEFAULT 'personal',
    status TEXT DEFAULT 'pending',
    settle_status TEXT DEFAULT 'unsettled',
    settle_time DATETIME, pay_time DATETIME,
    accept_time DATETIME, deliver_time DATETIME, verify_deadline DATETIME,
    video_url TEXT, material_urls TEXT,
    review_status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  , is_ad INTEGER DEFAULT 1, auth_letter_url TEXT, tax_rate REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sample_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT UNIQUE, user_id INTEGER, human_id INTEGER,
    script_id INTEGER,
    amount INTEGER DEFAULT 500000,  -- V6.0: 基础档5000元（分）
    cost_amount INTEGER DEFAULT 150000, -- AI+人工+编剧成本约1500元
    intent_amount INTEGER DEFAULT 100000,  -- V6.0: 意向金1000元
    production_fee INTEGER DEFAULT 400000, -- V6.0: 制作款4000元
    intent_paid INTEGER DEFAULT 0,         -- 意向金是否已付
    production_paid INTEGER DEFAULT 0,     -- 制作款是否已付
    status TEXT DEFAULT 'draft',  -- V6.0: draft|intent_paid|genre_selected|reference_picked|scripting|script_finalized|production_paid|producing|delivered|completed|cancelled
    step INTEGER DEFAULT 0,       -- V6.0: 当前步骤0-6
    genre TEXT,                   -- V6.0: 选定类型（古装逆袭等）
    reference_script_id INTEGER,  -- V6.0: 选定的对标剧本ID
    script_title TEXT,            -- V6.0: 剧本标题
    script_outline TEXT,          -- V6.0: 故事大纲
    script_characters TEXT,       -- V6.0: 人物设定（JSON）
    script_draft TEXT,            -- V6.0: 剧本初稿
    script_final TEXT,            -- V6.0: 定稿剧本
    script_status TEXT DEFAULT 'pending', -- V6.0: pending|writing|draft_ready|revising|finalized
    revision_count INTEGER DEFAULT 0,      -- V6.0: 已用修改轮次
    script_feedback TEXT,         -- V6.0: 修改意见（JSON数组）
    sample_url TEXT, proposal_url TEXT,
    preview_url TEXT,             -- V6.0: 成片预览URL
    redo_count INTEGER DEFAULT 0, -- V6.0: 成片修改次数
    project_id INTEGER,
    contact_name TEXT, contact_phone TEXT, -- V6.0: 联系方式
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  , prepay_amount INTEGER DEFAULT 0, preview_status TEXT, preview_deadline DATETIME, pay_time DATETIME);
CREATE TABLE IF NOT EXISTS sample_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    genre TEXT NOT NULL,           -- 类型：古装逆袭/都市甜宠/悬疑推理/玄幻修仙/家庭伦理等
    title TEXT NOT NULL,           -- 对标剧名/剧本标题
    outline TEXT NOT NULL,         -- 故事大纲
    characters TEXT,               -- 人物设定（JSON数组）
    tags TEXT,                     -- 标签（JSON数组）
    market_data TEXT,              -- 市场数据（JSON：热度/评分/同类票房等）
    heat_score INTEGER DEFAULT 0,  -- 热度分
    cover_url TEXT,                -- 封面图
    sort_order INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',  -- active | inactive
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS custom_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    genre TEXT,                    -- 类型
    format TEXT,                   -- 电影/中剧/短剧/网络大电影
    budget_min INTEGER,            -- 预算下限（分）
    budget_max INTEGER,            -- 预算上限（分）
    special_requirements TEXT,     -- 特殊需求（金牌编剧/知名导演/明星参演等）
    description TEXT,              -- 详细描述
    status TEXT DEFAULT 'new',     -- new | contacted | negotiating | signed | lost
    handler_id INTEGER,            -- 商务跟进人
    handler_note TEXT,             -- 跟进备注
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE,
    balance INTEGER DEFAULT 0,      -- 可提现余额（分）
    frozen INTEGER DEFAULT 0,       -- 冻结中（提现审核/纠纷）
    pending INTEGER DEFAULT 0,      -- 待结算（担保中）
    total_income INTEGER DEFAULT 0,
    total_withdrawn INTEGER DEFAULT 0,
    bank_card TEXT,                 -- AES加密存储
    alipay_account TEXT,
    id_verified INTEGER DEFAULT 0,  -- 实名认证+四要素验证
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_no TEXT UNIQUE,
    user_id INTEGER,
    type TEXT,                      -- income | withdraw | refund | adjustment
    amount INTEGER,                 -- 分（正入负出）
    balance_after INTEGER,
    order_type TEXT, order_id INTEGER,
    description TEXT,
    status TEXT DEFAULT 'done',     -- done | pending | failed
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    withdraw_no TEXT UNIQUE,
    user_id INTEGER,
    amount INTEGER, fee INTEGER,
    channel TEXT,                   -- bank | alipay
    account TEXT,                   -- 脱敏
    status TEXT DEFAULT 'pending',  -- pending | reviewing | approved | paying | success | rejected
    risk_score REAL DEFAULT 0,
    reviewer_id INTEGER,
    reject_reason TEXT,
    channel_txn_no TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME
  );
CREATE TABLE IF NOT EXISTS mcn_agencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER, name TEXT NOT NULL,
    license_url TEXT, contact_name TEXT, contact_phone TEXT,
    commission_rate REAL DEFAULT 10,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  , free_until DATETIME);
CREATE TABLE IF NOT EXISTS mcn_talents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mcn_id INTEGER, talent_id INTEGER,
    talent_share REAL DEFAULT 70,
    status TEXT DEFAULT 'active',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(mcn_id, talent_id)
  );
CREATE TABLE IF NOT EXISTS user_identities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE,
    identity_type TEXT NOT NULL,    -- personal | company | mcn
    real_name TEXT, id_card TEXT,   -- AES加密
    company_name TEXT, credit_code TEXT,
    license_url TEXT, mcn_id INTEGER,
    status TEXT DEFAULT 'pending',  -- pending | approved | rejected
    reject_reason TEXT,
    liveness_verified INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  , updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS content_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_type TEXT NOT NULL,     -- video | endorsement | project | comment | human
    content_id INTEGER NOT NULL,
    submitter_id INTEGER,
    machine_result TEXT,            -- pass | reject | review
    machine_score REAL,
    human_result TEXT,              -- pass | reject
    reviewer_id INTEGER,
    reason TEXT,
    status TEXT DEFAULT 'pending',  -- pending | machine_done | approved | rejected
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME
  );
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operator_id INTEGER,
    operator_role TEXT,
    action TEXT NOT NULL,           -- login | pay | settle | withdraw_approve | ban | config_change
    target_type TEXT, target_id TEXT,
    detail TEXT,                    -- JSON
    ip TEXT, user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER,
    target_type TEXT, target_id INTEGER,
    reason TEXT, description TEXT,
    status TEXT DEFAULT 'pending',  -- pending | processing | resolved | rejected
    handler_id INTEGER, reply TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,          -- 买家
    talent_user_id INTEGER NOT NULL,   -- 艺人所属用户
    human_id INTEGER NOT NULL,         -- 数字人ID
    order_no TEXT,                     -- 关联订单号（首条消息需有订单关系）
    last_message TEXT,
    last_message_at DATETIME,
    user_unread INTEGER DEFAULT 0,
    talent_unread INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, human_id)
  );
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    msg_type TEXT DEFAULT 'text',      -- text | image | order_card | system
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'operator',   -- super | finance | auditor | operator
    status TEXT DEFAULT 'active',
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS launch_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER, name TEXT NOT NULL, phone TEXT NOT NULL,
    talent_name TEXT, description TEXT, budget TEXT,
    status TEXT DEFAULT '待联系',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS audition_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER, name TEXT NOT NULL, style TEXT,
    description TEXT, phone TEXT NOT NULL,
    status TEXT DEFAULT '审核中',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS scene_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,              -- 模板名称
    category TEXT NOT NULL,          -- 分类：wedding/annual/graduation/valentine/birthday/festival/opening/custom
    icon TEXT,                       -- 图标标识
    suggested_price INTEGER DEFAULT 9900,  -- 推荐价格（分）
    suggested_duration INTEGER DEFAULT 15, -- 推荐时长（秒）
    default_message TEXT,            -- 默认祝福语模板
    description TEXT,                -- 模板描述
    preview_url TEXT,                -- 示例视频URL
    sort_order INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',    -- active | inactive
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS order_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT NOT NULL,
    order_type TEXT NOT NULL,        -- video | endorsement
    user_id INTEGER NOT NULL,        -- 评价人（买家）
    talent_id INTEGER NOT NULL,      -- 被评价艺人
    quality_rating INTEGER NOT NULL, -- 视频质量 1-5
    speed_rating INTEGER NOT NULL,   -- 交付速度 1-5
    service_rating INTEGER NOT NULL, -- 服务态度 1-5
    accuracy_rating INTEGER NOT NULL,-- 符合描述 1-5
    overall_rating REAL NOT NULL,    -- 综合评分（加权平均）
    content TEXT,                    -- 文字评价
    images TEXT,                     -- JSON数组：评价图片URL
    talent_reply TEXT,               -- 艺人回复
    talent_replied_at DATETIME,
    status TEXT DEFAULT 'active',    -- active | hidden
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(order_no, order_type)
  );
CREATE TABLE IF NOT EXISTS share_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,        -- 分享人
    order_no TEXT,                   -- 关联订单
    share_channel TEXT,              -- wechat_moments/wechat_friend/weibo/xiaohongshu/douyin
    share_poster_url TEXT,           -- 生成的分享海报URL
    invitee_user_id INTEGER,         -- 被邀请注册用户ID
    reward_amount INTEGER DEFAULT 0, -- 奖励金额（分）
    reward_status TEXT DEFAULT 'pending', -- pending | rewarded | expired
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,         -- 面额（分）
    min_spend INTEGER DEFAULT 0,     -- 最低消费门槛（分）
    coupon_type TEXT DEFAULT 'cash', -- cash | discount
    source TEXT DEFAULT 'share',     -- share | first_order | admin_grant
    status TEXT DEFAULT 'unused',    -- unused | used | expired
    order_no TEXT,                   -- 使用的订单号
    valid_from DATETIME DEFAULT CURRENT_TIMESTAMP,
    valid_until DATETIME,
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS consent_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    human_id INTEGER,
    step TEXT NOT NULL,              -- photo_upload | liveness | scope_select | confirm
    consent_text TEXT NOT NULL,      -- 该步骤展示的授权文本快照
    consented INTEGER DEFAULT 1,
    ip TEXT,
    device TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS talent_promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    human_id INTEGER NOT NULL,
    promotion_type TEXT NOT NULL,    -- ai_subsidy | commission_free | traffic_boost
    start_date DATETIME NOT NULL,
    end_date DATETIME NOT NULL,
    benefits TEXT,                   -- JSON：具体权益描述
    status TEXT DEFAULT 'active',    -- active | expired | terminated
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS scriptwriters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    real_name TEXT,
    pen_name TEXT,
    id_card TEXT,                    -- AES加密
    bio TEXT,                        -- 编剧经历
    works TEXT,                      -- 代表作品JSON
    status TEXT DEFAULT 'pending',   -- pending | approved | rejected
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS scripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scriptwriter_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    category TEXT,                   -- 短剧/中剧/电影
    genre TEXT,                      -- 类型
    word_count INTEGER,
    synopsis TEXT,
    file_url TEXT,                   -- 剧本文件（加密存储）
    filing_number TEXT,              -- 剧本备案号
    evidence_hash TEXT,              -- 时间戳存证哈希
    evidence_txid TEXT,              -- 区块链存证交易ID
    status TEXT DEFAULT 'pending',   -- pending | approved | adopted | rejected
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS endorsement_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT NOT NULL,
    platform TEXT NOT NULL,          -- douyin/xiaohongshu/weibo/wechat/offline
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS after_sales_timeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT NOT NULL,
    order_type TEXT NOT NULL,
    action TEXT NOT NULL,            -- apply | accept | processing | redo | refund_approve | refund_success | reject
    operator_role TEXT,              -- user | talent | platform
    operator_id INTEGER,
    remark TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,          -- 套餐价格（分）
    video_count INTEGER NOT NULL,    -- 包含视频数量
    validity_months INTEGER DEFAULT 12,
    description TEXT,
    benefits TEXT,                   -- JSON：权益列表
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS user_packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    package_id INTEGER NOT NULL,
    order_no TEXT,
    total_count INTEGER NOT NULL,
    used_count INTEGER DEFAULT 0,
    start_date DATETIME,
    end_date DATETIME,
    status TEXT DEFAULT 'active',    -- active | expired | used_up
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS idempotent_keys (
    idempotent_key TEXT PRIMARY KEY,
    response TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS sms_verification_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'login',   -- login | bind | notify
    code_hash TEXT NOT NULL,                 -- 只存 SHA256 哈希，不落明文
    expires_at INTEGER NOT NULL,             -- epoch ms，5 分钟有效
    consumed INTEGER NOT NULL DEFAULT 0,     -- 0 未用 1 已用（一次性）
    fail_count INTEGER NOT NULL DEFAULT 0,   -- 连续输错次数
    locked_until INTEGER NOT NULL DEFAULT 0, -- 失败超限锁定到该时刻
    send_ip TEXT,
    provider_msg_id TEXT,
    created_at INTEGER NOT NULL,
    consumed_at INTEGER
  );
CREATE TABLE IF NOT EXISTS ai_generation_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_type TEXT NOT NULL,                 -- seedream_t2i | seedance_t2v | seedance_i2v | tts | voice_clone
    upstream_id TEXT,                        -- 方舟异步任务ID
    user_id INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',  -- pending | running | succeeded | failed
    model TEXT,
    request_json TEXT,
    result_url TEXT,                         -- 转存后的相对 URL（/uploads/...）
    result_meta TEXT,
    error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    cost_fen REAL NOT NULL DEFAULT 0,
    usage_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    finished_at INTEGER
  );
CREATE TABLE IF NOT EXISTS ai_cost_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    svc TEXT NOT NULL,                       -- ark | openspeech | sms
    action TEXT NOT NULL,
    model TEXT,
    user_id INTEGER,
    ok INTEGER NOT NULL DEFAULT 1,
    http_code INTEGER,
    billed_units REAL NOT NULL DEFAULT 0,    -- 计费量（字符/张/秒/条/token）
    unit TEXT,
    est_cost_fen REAL NOT NULL DEFAULT 0,
    request_id TEXT,
    meta TEXT
  );
CREATE TABLE IF NOT EXISTS contact_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id INTEGER NOT NULL,      -- 申请人（买家）
    human_id INTEGER NOT NULL,
    talent_user_id INTEGER NOT NULL,    -- 艺人所属用户
    order_no TEXT,
    message TEXT,
    platform_disclaimer INTEGER DEFAULT 1, -- 已确认平台免责声明
    status TEXT DEFAULT 'pending',      -- pending | approved | rejected
    contact_shared TEXT,                -- 同意后加密/JSON 存放的联系方式
    handled_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pay_no TEXT UNIQUE NOT NULL,       -- 平台支付单号（幂等键之一）
    order_no TEXT NOT NULL,            -- 业务订单号
    biz_type TEXT NOT NULL,            -- video | sample | endorsement | dream(定制剧席位)
    stage TEXT NOT NULL DEFAULT '',    -- sample 分期：intent(意向金)|production(制作款)；其它业务为 ''
    amount_fen INTEGER NOT NULL,       -- 金额（分），服务端订单/config 决定，绝不信前端
    status TEXT NOT NULL DEFAULT 'pending', -- pending(待支付) | paid(已支付) | closed(已关闭) | refunded(已退款)
    channel TEXT NOT NULL DEFAULT 'alipay', -- 支付渠道，本期 alipay
    trade_no TEXT,                     -- 支付宝交易流水号（回调/查单回填）
    buyer_id INTEGER,                  -- 下单用户 id
    subject TEXT,                      -- 订单标题
    order_string TEXT,                 -- APP 端唤起支付宝用的待签订单串
    notify_hash TEXT,                  -- 异步通知原文 SHA256（回调幂等去重）
    paid_at DATETIME,                  -- 支付成功时间
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE INDEX IF NOT EXISTS idx_humans_region ON humans(province, city, district);
CREATE INDEX IF NOT EXISTS idx_humans_heat ON humans(heat DESC);
CREATE INDEX IF NOT EXISTS idx_humans_status ON humans(status);
CREATE INDEX IF NOT EXISTS idx_video_orders_user ON video_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_video_orders_talent ON video_orders(talent_id);
CREATE INDEX IF NOT EXISTS idx_video_orders_status ON video_orders(status);
CREATE INDEX IF NOT EXISTS idx_video_orders_settle ON video_orders(settle_status);
CREATE INDEX IF NOT EXISTS idx_payment_order ON payment_transactions(order_no);
CREATE INDEX IF NOT EXISTS idx_payment_channel ON payment_transactions(channel_txn_no);
CREATE INDEX IF NOT EXISTS idx_payment_status ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_no);
CREATE INDEX IF NOT EXISTS idx_claims_user ON claims(user_id);
CREATE INDEX IF NOT EXISTS idx_claims_project ON claims(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON content_reviews(status);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_auth_user ON authorization_agreements(user_id, human_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_talent ON conversations(talent_user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_humans_location ON humans(lat, lng);
CREATE INDEX IF NOT EXISTS idx_deposits_user ON talent_deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON talent_deposits(status);
CREATE INDEX IF NOT EXISTS idx_face_user ON face_materials(user_id, human_id);
CREATE INDEX IF NOT EXISTS idx_consents_user ON user_consents(user_id, consent_type);
CREATE INDEX IF NOT EXISTS idx_abnormal_user ON abnormal_events(user_id, event_type);
CREATE INDEX IF NOT EXISTS idx_abnormal_severity ON abnormal_events(severity, resolved);
CREATE INDEX IF NOT EXISTS idx_abnormal_created ON abnormal_events(created_at);
CREATE INDEX IF NOT EXISTS idx_minor_user ON minor_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_scene_tpl_category ON scene_templates(category, status);
CREATE INDEX IF NOT EXISTS idx_order_reviews_talent ON order_reviews(talent_id, status);
CREATE INDEX IF NOT EXISTS idx_order_reviews_order ON order_reviews(order_no);
CREATE INDEX IF NOT EXISTS idx_share_records_user ON share_records(user_id);
CREATE INDEX IF NOT EXISTS idx_share_records_invitee ON share_records(invitee_user_id);
CREATE INDEX IF NOT EXISTS idx_coupons_user ON coupons(user_id, status);
CREATE INDEX IF NOT EXISTS idx_consent_steps_user ON consent_steps(user_id, human_id);
CREATE INDEX IF NOT EXISTS idx_promotions_user ON talent_promotions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_scripts_writer ON scripts(scriptwriter_id, status);
CREATE INDEX IF NOT EXISTS idx_endo_metrics_order ON endorsement_metrics(order_no);
CREATE INDEX IF NOT EXISTS idx_after_sales_order ON after_sales_timeline(order_no);
CREATE INDEX IF NOT EXISTS idx_user_packages_user ON user_packages(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sample_library_genre ON sample_library(genre, status);
CREATE INDEX IF NOT EXISTS idx_sample_library_heat ON sample_library(heat_score DESC);
CREATE INDEX IF NOT EXISTS idx_sample_orders_user ON sample_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_sample_orders_status ON sample_orders(status);
CREATE INDEX IF NOT EXISTS idx_custom_requests_status ON custom_requests(status);
CREATE INDEX IF NOT EXISTS idx_sms_code_phone ON sms_verification_codes(phone, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_task_status ON ai_generation_tasks(status);
CREATE INDEX IF NOT EXISTS idx_ai_task_upstream ON ai_generation_tasks(upstream_id);
CREATE INDEX IF NOT EXISTS idx_ai_task_user ON ai_generation_tasks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_cost_day ON ai_cost_log(created_at);
CREATE INDEX IF NOT EXISTS idx_contact_requester ON contact_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_contact_talent ON contact_requests(talent_user_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_no, stage);
CREATE INDEX IF NOT EXISTS idx_payments_biz_status ON payments(biz_type, status);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_buyer ON payments(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_trade ON payments(trade_no);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_pending
    ON payments(order_no, stage) WHERE status = 'pending';
    `);
  },
};

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS citext;

-- Enum types
CREATE TYPE segment_type_enum AS ENUM ('GREETING', 'BODY', 'CLOSING');
CREATE TYPE subscription_status_enum AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE', 'INCOMPLETE_EXPIRED');
CREATE TYPE message_status_enum AS ENUM ('pending', 'processing', 'sent', 'delivered', 'failed');
CREATE TYPE gender_enum AS ENUM ('MALE', 'FEMALE', 'NEUTRAL', 'ALL');
CREATE TYPE birthday_mode_enum AS ENUM ('EARLY', 'ON_DAY', 'BELATED');

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email CITEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    stripe_customer_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::JSONB
);
COMMENT ON TABLE users IS 'Registered users of BirthdayMessaging.';
COMMENT ON COLUMN users.email IS 'Unique, case-insensitive email used for login.';
COMMENT ON COLUMN users.password_hash IS 'Argon2/bcrypt hash stored for user authentication.';

-- Subscription history
CREATE TABLE subscription_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status subscription_status_enum NOT NULL,
    price_id TEXT NOT NULL,
    stripe_subscription_id TEXT NOT NULL,
    stripe_customer_id TEXT NOT NULL,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    canceled_at TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::JSONB
);
COMMENT ON TABLE subscription_records IS 'Chronological subscription records linked to Stripe.';
COMMENT ON COLUMN subscription_records.status IS 'Current Stripe status for the linked subscription.';
COMMENT ON COLUMN subscription_records.stripe_subscription_id IS 'Stripe identifier for the subscription.';
COMMENT ON COLUMN subscription_records.stripe_customer_id IS 'Stripe customer identifier captured at checkout.';
CREATE INDEX idx_subscription_user ON subscription_records (user_id);
CREATE INDEX idx_subscription_user_status ON subscription_records (user_id, status);
CREATE UNIQUE INDEX uniq_active_subscription_per_user ON subscription_records (user_id)
    WHERE status = 'ACTIVE';

-- Template segments
CREATE TABLE template_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    segment_type segment_type_enum NOT NULL,
    label TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
COMMENT ON TABLE template_segments IS 'Message template segments grouped by type for each user.';
COMMENT ON COLUMN template_segments.segment_type IS 'Segment category: GREETING, BODY, or CLOSING.';
COMMENT ON COLUMN template_segments.content IS 'Actual text used when composing birthday messages.';
ALTER TABLE template_segments ADD CONSTRAINT chk_template_content_nonempty CHECK (trim(content) <> '');
CREATE INDEX idx_template_user_type ON template_segments (user_id, segment_type)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_template_user_deleted ON template_segments (user_id, deleted_at);

-- Birthday schedules
CREATE TABLE birthday_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    days_before INTEGER NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE birthday_schedules IS 'User-configured birthday notification schedules.';
COMMENT ON COLUMN birthday_schedules.days_before IS 'Number of days before birthday to send message.';
COMMENT ON COLUMN birthday_schedules.enabled IS 'Whether this schedule is active.';
CREATE INDEX idx_schedule_user_enabled ON birthday_schedules (user_id, enabled);
CREATE UNIQUE INDEX uniq_schedule_user_days ON birthday_schedules (user_id, days_before);

-- Message queue
CREATE TABLE message_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_name TEXT NOT NULL,
    friend_profile_url TEXT NOT NULL,
    birthday_date TIMESTAMPTZ NOT NULL,
    scheduled_send_time TIMESTAMPTZ NOT NULL,
    message_content TEXT NOT NULL,
    status message_status_enum NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE message_queue IS 'Queued birthday messages pending delivery.';
COMMENT ON COLUMN message_queue.status IS 'Current status of the queued message.';
COMMENT ON COLUMN message_queue.scheduled_send_time IS 'When the message should be sent.';
CREATE INDEX idx_queue_user_status ON message_queue (user_id, status);
CREATE INDEX idx_queue_scheduled_time ON message_queue (scheduled_send_time);

-- Message history
CREATE TABLE message_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_name TEXT NOT NULL,
    friend_profile_url TEXT NOT NULL,
    birthday_date TIMESTAMPTZ NOT NULL,
    message_content TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status message_status_enum NOT NULL DEFAULT 'sent',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE message_history IS 'Historical record of all sent birthday messages.';
COMMENT ON COLUMN message_history.sent_at IS 'When the message was actually sent.';
COMMENT ON COLUMN message_history.status IS 'Final status of the message delivery.';
CREATE INDEX idx_history_user_sent ON message_history (user_id, sent_at);
CREATE INDEX idx_history_user_status ON message_history (user_id, status);

-- Password reset tokens
CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE password_reset_tokens IS 'Temporary tokens for password reset flow.';
COMMENT ON COLUMN password_reset_tokens.token IS 'Secure random token for password reset.';
COMMENT ON COLUMN password_reset_tokens.expires_at IS 'Token expiration timestamp.';
COMMENT ON COLUMN password_reset_tokens.used_at IS 'When the token was used (null if unused).';
CREATE INDEX idx_reset_token_expires ON password_reset_tokens (token, expires_at);
CREATE INDEX idx_reset_user_created ON password_reset_tokens (user_id, created_at);

-- ========== Phase 2 Tables ==========

-- Contacts
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    facebook_profile_url TEXT NOT NULL,
    birthday TIMESTAMPTZ NOT NULL,
    gender gender_enum,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE contacts IS 'User-managed birthday contacts.';
COMMENT ON COLUMN contacts.name IS 'Full name of the contact.';
COMMENT ON COLUMN contacts.facebook_profile_url IS 'Facebook profile URL for automated messaging.';
COMMENT ON COLUMN contacts.birthday IS 'Birthday date of the contact.';
COMMENT ON COLUMN contacts.gender IS 'Gender for gender-specific message filtering.';
CREATE INDEX idx_contact_user_birthday ON contacts (user_id, birthday);
CREATE INDEX idx_contact_user_gender ON contacts (user_id, gender);

-- Message Groups
CREATE TABLE message_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    gender gender_enum NOT NULL,
    segment_ids JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE message_groups IS 'Groups of template segments for gender-specific messages.';
COMMENT ON COLUMN message_groups.segment_ids IS 'Array of template segment IDs to combine.';
COMMENT ON COLUMN message_groups.gender IS 'Target gender for this message group.';
CREATE INDEX idx_message_group_user_gender ON message_groups (user_id, gender);

-- Posts
CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    image_url TEXT,
    gender gender_enum NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    label TEXT,    font_family TEXT DEFAULT 'Arial',
    font_size INTEGER DEFAULT 48,
    font_color TEXT DEFAULT '#ffffff',    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE posts IS 'Timeline posts for birthday automation.';
COMMENT ON COLUMN posts.content IS 'Post content text.';
COMMENT ON COLUMN posts.image_url IS 'Optional image URL for the post.';
COMMENT ON COLUMN posts.gender IS 'Target gender for this post.';
COMMENT ON COLUMN posts.is_default IS 'Whether this is the default post for the gender.';
CREATE INDEX idx_post_user_gender ON posts (user_id, gender);
CREATE INDEX idx_post_user_default ON posts (user_id, is_default);

-- User Images
CREATE TABLE user_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    filename TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE user_images IS 'User-uploaded images for birthday posts.';
COMMENT ON COLUMN user_images.url IS 'URL or data URI of the image.';
COMMENT ON COLUMN user_images.filename IS 'Original filename.';
COMMENT ON COLUMN user_images.size IS 'File size in bytes.';
CREATE INDEX idx_user_image_user_created ON user_images (user_id, created_at);

-- Birthday Configs
CREATE TABLE birthday_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode birthday_mode_enum NOT NULL,
    days_offset INTEGER NOT NULL,
    message_group_id UUID REFERENCES message_groups(id) ON DELETE CASCADE,
    post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
    gender_filter gender_enum NOT NULL,
    archive_enabled BOOLEAN NOT NULL DEFAULT false,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE birthday_configs IS 'Advanced birthday automation configurations.';
COMMENT ON COLUMN birthday_configs.mode IS 'Timing mode: EARLY, ON_DAY, or BELATED.';
COMMENT ON COLUMN birthday_configs.days_offset IS 'Number of days offset from birthday.';
COMMENT ON COLUMN birthday_configs.message_group_id IS 'Message group to use for this config.';
COMMENT ON COLUMN birthday_configs.post_id IS 'Timeline post to use for this config.';
COMMENT ON COLUMN birthday_configs.gender_filter IS 'Target gender for this config.';
COMMENT ON COLUMN birthday_configs.archive_enabled IS 'Whether to archive conversations after sending.';
CREATE INDEX idx_birthday_config_user_mode ON birthday_configs (user_id, mode);
CREATE INDEX idx_birthday_config_user_enabled ON birthday_configs (user_id, enabled);
CREATE UNIQUE INDEX uniq_birthday_config_user_mode_offset ON birthday_configs (user_id, mode, days_offset);

-- SMTP Configs
CREATE TABLE smtp_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    use_tls BOOLEAN NOT NULL DEFAULT true,
    from_email TEXT NOT NULL,
    from_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE smtp_configs IS 'User SMTP configurations for email notifications.';
COMMENT ON COLUMN smtp_configs.host IS 'SMTP server hostname.';
COMMENT ON COLUMN smtp_configs.port IS 'SMTP server port.';
COMMENT ON COLUMN smtp_configs.password IS 'SMTP password (should be encrypted in production).';
COMMENT ON COLUMN smtp_configs.use_tls IS 'Whether to use TLS encryption.';
CREATE UNIQUE INDEX idx_smtp_config_user ON smtp_configs (user_id);

-- Message Templates (Complete templates with greeting, body, closing)
CREATE TABLE message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    greeting TEXT NOT NULL,
    sentiment TEXT NOT NULL,
    closing TEXT NOT NULL,
    image_url TEXT,
    days_in_advance INTEGER NOT NULL DEFAULT 0,
    gender gender_enum NOT NULL DEFAULT 'ALL',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE message_templates IS 'Complete message templates with greeting, sentiment (body), and closing.';
COMMENT ON COLUMN message_templates.title IS 'User-friendly template name/title.';
COMMENT ON COLUMN message_templates.greeting IS 'Opening message text.';
COMMENT ON COLUMN message_templates.sentiment IS 'Main body/message content.';
COMMENT ON COLUMN message_templates.closing IS 'Closing message text.';
COMMENT ON COLUMN message_templates.image_url IS 'Optional image URL for the message.';
COMMENT ON COLUMN message_templates.days_in_advance IS 'Number of days before/after birthday (positive=early, negative=late).';
COMMENT ON COLUMN message_templates.gender IS 'Target gender filter: all, male, or female.';
CREATE INDEX idx_message_template_user ON message_templates (user_id);
CREATE INDEX idx_message_template_user_gender ON message_templates (user_id, gender);

-- Utility indexes
CREATE INDEX idx_users_stripe_customer ON users (stripe_customer_id);

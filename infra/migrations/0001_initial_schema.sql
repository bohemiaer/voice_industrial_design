create extension if not exists pgcrypto;

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  goal text not null,
  product_domain text not null check (product_domain = 'industrial_design'),
  status text not null default 'active' check (status in ('active', 'archived')),
  root_node_id uuid null,
  active_node_id uuid null,
  pending_node_id uuid null,
  last_mentioned_node_id uuid null,
  next_public_node_number integer not null default 1 check (next_public_node_number >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists generation_tasks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  target_node_id uuid not null,
  action_type text not null check (action_type in ('expand_branches', 'refresh_layer', 'branch_deeper')),
  status text not null check (status in ('queued', 'transcribing', 'reasoning', 'awaiting_confirmation', 'generating', 'completed', 'failed', 'cancelled')),
  confirmation_required boolean not null default false,
  confirmation_status text not null default 'not_required' check (confirmation_status in ('not_required', 'awaiting_confirmation', 'confirmed', 'cancelled')),
  transcript_text text not null,
  design_intent_summary text not null,
  rewritten_intent_for_confirmation text null,
  assistant_reply text null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tree_nodes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  parent_node_id uuid null references tree_nodes(id) on delete set null,
  created_from_task_id uuid null references generation_tasks(id) on delete set null,
  depth integer not null check (depth >= 0),
  layer_ordinal integer not null check (layer_ordinal >= 1),
  layer_version integer not null check (layer_version >= 1),
  public_node_number integer not null check (public_node_number >= 1),
  display_name text not null,
  label text not null,
  voice_aliases jsonb not null default '[]'::jsonb,
  intent_summary text not null,
  form_language jsonb not null default '[]'::jsonb,
  user_need_response jsonb not null default '[]'::jsonb,
  inspiration_hints jsonb not null default '[]'::jsonb,
  image_url text null,
  status text not null check (status in ('draft', 'generating', 'ready', 'failed')),
  superseded_at timestamptz null,
  superseded_by_operation_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uidx_tree_nodes_session_public_node_number unique (session_id, public_node_number),
  constraint uidx_tree_nodes_parent_version_ordinal unique (parent_node_id, layer_version, layer_ordinal),
  constraint uidx_tree_nodes_parent_version_display_name unique (parent_node_id, layer_version, display_name)
);

create table if not exists branch_tasks (
  id uuid primary key default gen_random_uuid(),
  generation_task_id uuid not null references generation_tasks(id) on delete cascade,
  branch_index integer not null check (branch_index >= 0),
  status text not null check (status in ('queued', 'generating', 'completed', 'failed')),
  brief_payload jsonb not null,
  image_url text null,
  persisted_node_id uuid null references tree_nodes(id) on delete set null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tree_operations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  task_id uuid null references generation_tasks(id) on delete set null,
  type text not null check (type in ('expand_branches', 'refresh_layer', 'branch_deeper', 'undo')),
  target_node_id uuid not null,
  target_layer_version integer null,
  inserted_node_ids jsonb not null default '[]'::jsonb,
  superseded_node_ids jsonb not null default '[]'::jsonb,
  restored_node_ids jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  task_id uuid null references generation_tasks(id) on delete set null,
  role text not null check (role in ('user', 'assistant', 'system')),
  kind text not null check (kind in ('transcript', 'status', 'summary', 'confirmation', 'hint')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_sessions_status on sessions(status);
create index if not exists idx_sessions_updated_at on sessions(updated_at desc);

create index if not exists idx_messages_session_created_at on messages(session_id, created_at asc);
create index if not exists idx_messages_task_id on messages(task_id);

create index if not exists idx_tree_nodes_parent_node_id on tree_nodes(parent_node_id);
create index if not exists idx_tree_nodes_session_depth on tree_nodes(session_id, depth);
create index if not exists idx_tree_nodes_session_status on tree_nodes(session_id, status);
create index if not exists idx_tree_nodes_superseded_at on tree_nodes(superseded_at);

create index if not exists idx_generation_tasks_session_created_at on generation_tasks(session_id, created_at desc);
create index if not exists idx_generation_tasks_session_status on generation_tasks(session_id, status);
create index if not exists idx_generation_tasks_target_node_id on generation_tasks(target_node_id);

create index if not exists idx_branch_tasks_generation_task_id on branch_tasks(generation_task_id);
create index if not exists idx_branch_tasks_generation_task_status on branch_tasks(generation_task_id, status);

create index if not exists idx_tree_operations_session_created_at on tree_operations(session_id, created_at desc);
create index if not exists idx_tree_operations_task_id on tree_operations(task_id);
create index if not exists idx_tree_operations_target_node_id on tree_operations(target_node_id);

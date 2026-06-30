alter table sessions
  add column if not exists owner_user_id text,
  add column if not exists current_selected_node_id uuid null,
  add column if not exists last_executed_target_node_id uuid null;

update sessions
set owner_user_id = 'local-workbench-user'
where owner_user_id is null;

alter table sessions
  alter column owner_user_id set not null;

alter table tree_nodes
  add column if not exists suggested_followups jsonb not null default '[]'::jsonb;

alter table tree_operations
  add column if not exists affected_child_group_id uuid null,
  add column if not exists deleted_node_ids jsonb not null default '[]'::jsonb,
  add column if not exists undo_of_operation_id uuid null,
  add column if not exists redo_of_operation_id uuid null;

alter table generation_tasks
  drop constraint if exists generation_tasks_action_type_check;

alter table generation_tasks
  add constraint generation_tasks_action_type_check
  check (action_type in ('diverge', 'refresh'));

alter table tree_operations
  drop constraint if exists tree_operations_type_check;

alter table tree_operations
  add constraint tree_operations_type_check
  check (type in ('diverge', 'refresh', 'delete', 'undo', 'redo'));

alter table messages
  drop constraint if exists messages_kind_check;

alter table messages
  add constraint messages_kind_check
  check (kind in (
    'intent',
    'transcript',
    'status',
    'summary',
    'confirmation',
    'hint',
    'chat',
    'node_explanation',
    'memory_summary'
  ));

create index if not exists idx_sessions_owner_user_updated_at
  on sessions(owner_user_id, updated_at desc);

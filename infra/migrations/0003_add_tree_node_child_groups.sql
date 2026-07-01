alter table tree_nodes
  add column if not exists child_group_id uuid null;

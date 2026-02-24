export interface Entity {
  entity_id: string;
  entity_type: string;
  attributes: Record<string, unknown>;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface EntityRelationship {
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  relationship_type: string;
  attributes: Record<string, unknown>;
  created_at: Date;
}

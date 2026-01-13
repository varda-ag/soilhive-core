export interface Selection {
  id: string;
  label: string;
}

export interface SelectionPillsProps {
  selections: Selection[];
  onRemove: (id: string) => void;
}

export interface PillProps {
  selection: Selection;
  onRemove: (id: string) => void;
}

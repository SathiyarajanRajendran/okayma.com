// The delivery stages an idea moves through after it is approved.
//
// This list is the single source of truth: the database column is a plain TEXT
// with no CHECK constraint, so adding or renaming a stage is an edit here and
// nothing else. The admin console and the public board both read their labels
// and ordering from this file via /api/stages.

export const STAGES = [
  {
    key: "ideation",
    label: "Ideation",
    blurb: "Written down and being thought through.",
    pipeline: true,
  },
  {
    key: "design",
    label: "Design",
    blurb: "Shape, scope and approach being worked out.",
    pipeline: true,
  },
  {
    key: "development",
    label: "Development",
    blurb: "Being built.",
    pipeline: true,
  },
  {
    key: "investment",
    label: "Investment",
    blurb: "Seeking the backing to take it further.",
    pipeline: true,
  },
  {
    key: "marketing",
    label: "Marketing",
    blurb: "Finding the people it is for.",
    pipeline: true,
  },
  {
    key: "launched",
    label: "Launched",
    blurb: "Out in the world.",
    pipeline: true,
  },
  // Off-pipeline states. They are reachable from anywhere and are excluded
  // from progress counts, so a stalled idea does not read as momentum.
  {
    key: "on_hold",
    label: "On hold",
    blurb: "Paused for now, not abandoned.",
    pipeline: false,
  },
  {
    key: "archived",
    label: "Archived",
    blurb: "Closed. Kept for the record.",
    pipeline: false,
  },
];

export const DEFAULT_STAGE = "ideation";

const BY_KEY = new Map(STAGES.map((s) => [s.key, s]));

export function isStage(key) {
  return BY_KEY.has(key);
}

export function stageLabel(key) {
  const stage = BY_KEY.get(key);
  return stage ? stage.label : key;
}

// Position within the pipeline, 1-based. Off-pipeline stages return 0 so they
// sort ahead of nothing and are easy to filter out.
export function stageOrder(key) {
  const index = STAGES.findIndex((s) => s.key === key && s.pipeline);
  return index === -1 ? 0 : index + 1;
}

export const PIPELINE_STAGES = STAGES.filter((s) => s.pipeline);

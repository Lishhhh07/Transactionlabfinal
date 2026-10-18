const STYLES = [
  { chip: "bg-blue-100 text-blue-800 border-blue-300",       cell: "bg-blue-50",    head: "text-blue-700" },
  { chip: "bg-emerald-100 text-emerald-800 border-emerald-300", cell: "bg-emerald-50", head: "text-emerald-700" },
  { chip: "bg-amber-100 text-amber-800 border-amber-300",     cell: "bg-amber-50",   head: "text-amber-700" },
  { chip: "bg-purple-100 text-purple-800 border-purple-300",  cell: "bg-purple-50",  head: "text-purple-700" },
];

export function styleOf(txnId: string) {
  const n = parseInt(txnId.slice(1), 10) || 1;
  return STYLES[(n - 1) % STYLES.length];
}
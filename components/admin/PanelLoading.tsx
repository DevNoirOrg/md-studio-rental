/** Betöltés közbeni váz az admin oldalakhoz. */
export default function PanelLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-10 w-64 animate-pulse rounded-xl bg-slate-200" />
      <div className="h-48 animate-pulse rounded-[1.75rem] bg-white" />
      <div className="h-48 animate-pulse rounded-[1.75rem] bg-white" />
    </div>
  );
}

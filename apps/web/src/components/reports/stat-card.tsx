import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';

/** Número único como respuesta principal (no un gráfico) — ver skill de dataviz: "a stat tile or hero number". */
export function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">{value}</CardTitle>
      </CardContent>
    </Card>
  );
}

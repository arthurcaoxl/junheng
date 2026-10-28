export interface WeightRecord {
  kind: "weight";
  value: number;
  unit: "kg";
  measuredAt: string;
}

export interface WaistRecord {
  kind: "waist";
  value: number;
  unit: "cm";
  measuredAt: string;
}

export interface MealCheckIn {
  kind: "meal";
  meal: "breakfast" | "lunch" | "dinner";
  eatenAt: string;
  preMealDrink: boolean;
  note?: string;
}

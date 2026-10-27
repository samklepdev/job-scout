"use client";

import { useState } from "react";

export function RangeField({ name, label, defaultValue }: { name: string; label: string; defaultValue: number }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <>
      <span>{label}</span>
      <input
        type="range"
        name={name}
        min={0}
        max={10}
        step={1}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        aria-label={`${label} weight`}
      />
      <output>{value}</output>
    </>
  );
}

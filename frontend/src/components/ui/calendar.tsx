"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker@8.10.1";
import "react-day-picker/dist/style.css";

import { cn } from "./utils";

function Calendar({
  className,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("rounded-md bg-white p-3", className)}
      {...props}
    />
  );
}

export { Calendar };

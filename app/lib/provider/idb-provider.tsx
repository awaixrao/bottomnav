"use client";

import { configureIdb } from "universe-code/react";

export function IdbProvider() {
  configureIdb({
    dbName: "awaisdb",
    dbVersion: 1,
    storeName: "awais",
  });

  return null;
}
// app/dashboard/menu/item/[id]/page.tsx
import * as React from "react";
import ItemDetailsClient from "./client";

export default function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next 15: params is a Promise — unwrap with React.use()
  const { id } = React.use(params);
  return <ItemDetailsClient id={id} />;
}

import { redirect } from "next/navigation";

// The monitor IS the home page now — old bookmarks land there.
export default function MonitorRedirect() {
  redirect("/");
}

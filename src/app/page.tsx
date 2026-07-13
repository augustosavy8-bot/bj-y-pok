import { redirect } from "next/navigation";

// La raíz redirige al lobby. El middleware garantiza que haya sesión.
export default function Index() {
  redirect("/home");
}

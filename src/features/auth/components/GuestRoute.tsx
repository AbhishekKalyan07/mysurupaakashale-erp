import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ROLE_HOME_ROUTE } from "@/shared/constants/roles";
import { LoadingScreen } from "@/shared/components/feedback/LoadingScreen";
import { useAuth } from "../hooks/useAuth";

export function GuestRoute() {
  const { status, role } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <LoadingScreen />;
  }

  if (status === "authenticated" && role) {
    const fromLocation = (location.state as any)?.from;
    let target = fromLocation
      ? `${fromLocation.pathname || ""}${fromLocation.search || ""}${fromLocation.hash || ""}`
      : null;

    if (!target) {
      try {
        target = sessionStorage.getItem("auth_redirect_from");
        sessionStorage.removeItem("auth_redirect_from");
      } catch {}
    }

    // Role-compatibility check to avoid redirect bouncing across roles
    if (target) {
      if (
        target.startsWith("/admin") &&
        role !== "admin" &&
        role !== "accounts"
      ) {
        target = null;
      } else if (
        target.startsWith("/kitchen") &&
        role !== "kitchen" &&
        role !== "admin"
      ) {
        target = null;
      } else if (
        target.startsWith("/delivery") &&
        role !== "delivery_partner" &&
        role !== "admin"
      ) {
        target = null;
      } else if (target.startsWith("/customer") && role !== "customer") {
        target = null;
      }
    }

    const destination = target || ROLE_HOME_ROUTE[role];
    return <Navigate to={destination} replace />;
  }

  return <Outlet />;
}

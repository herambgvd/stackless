import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { authApi } from "../api/auth.api";
import { useAuthStore } from "@/shared/store/auth.store";
import { apiClient } from "@/shared/lib/api-client";

async function _fetchAndStoreCsrfToken() {
  try {
    const { data } = await apiClient.get("/auth/csrf-token");
    useAuthStore.getState().setCsrfToken(data.csrf_token);
  } catch {
    // Best-effort — CSRF middleware will reject mutating requests if missing
  }
}

export function useLogin({ onRequires2FA } = {}) {
  const { setAuth, setTokens } = useAuthStore();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: authApi.login,
    onSuccess: async (resp) => {
      // Check for 2FA challenge
      if (resp.requires_2fa && resp.temp_token) {
        onRequires2FA?.(resp.temp_token);
        return;
      }
      // Full tokens returned — proceed normally
      const tokens = {
        access_token: resp.access_token,
        refresh_token: resp.refresh_token,
        token_type: resp.token_type,
        expires_in: resp.expires_in,
      };
      setTokens(tokens);
      const user = await authApi.getMe();
      setAuth(user, tokens);
      await _fetchAndStoreCsrfToken();

      // Invited users must change password before accessing the platform
      if (resp.must_change_password || user?.must_change_password) {
        navigate({ to: "/change-password-required" });
        return;
      }

      if (user?.is_superuser) {
        navigate({ to: "/admin/tenants" });
      } else {
        navigate({ to: "/dashboard" });
      }
    },
    onError: (err) => toast.error(err.response?.data?.detail || err.message || "Login failed"),
  });
}

export function useVerify2FA() {
  const { setAuth, setTokens } = useAuthStore();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: authApi.verify2fa,
    onSuccess: async (tokens) => {
      setTokens(tokens);
      const user = await authApi.getMe();
      setAuth(user, tokens);
      await _fetchAndStoreCsrfToken();

      // Invited users must change password before accessing the platform
      if (user?.must_change_password) {
        navigate({ to: "/change-password-required" });
        return;
      }

      if (user?.is_superuser) {
        navigate({ to: "/admin/tenants" });
      } else {
        navigate({ to: "/dashboard" });
      }
    },
    onError: (err) => toast.error(err.response?.data?.detail || "Invalid 2FA code"),
  });
}

export function useRegister() {
  const { setAuth, setTokens } = useAuthStore();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: authApi.register,
    onSuccess: async (tokens) => {
      setTokens(tokens);
      const user = await authApi.getMe();
      setAuth(user, tokens);
      await _fetchAndStoreCsrfToken();
      navigate({ to: "/onboarding" });
    },
    onError: (err) => toast.error(err.response?.data?.detail || err.message || "Registration failed"),
  });
}

export function useLogout() {
  const { tokens, logout } = useAuthStore();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: () => authApi.logout(tokens?.refresh_token),
    onSettled: () => {
      logout();
      navigate({ to: "/" });
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email) => authApi.forgotPassword(email),
    onSuccess: () => toast.success("If that email exists, a reset link has been sent."),
    onError: () => toast.error("Something went wrong. Please try again."),
  });
}

export function useResetPassword() {
  const navigate = useNavigate();

  return useMutation({
    mutationFn: ({ token, new_password }) => authApi.resetPassword(token, new_password),
    onSuccess: () => {
      toast.success("Password reset successfully. Please sign in.");
      navigate({ to: "/login" });
    },
    onError: (err) => toast.error(err.response?.data?.detail || "Invalid or expired reset link."),
  });
}

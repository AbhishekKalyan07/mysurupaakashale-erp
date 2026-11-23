import { vi, describe, it, expect, beforeEach } from "vitest";

const {
  mockCreateUserWithEmailAndPassword,
  mockUpdateProfile,
  mockSignOut,
  mockUserDelete,
  mockDoc,
  mockGetDoc,
  mockWriteBatch,
  mockServerTimestamp,
  mockHttpsCallable,
} = vi.hoisted(() => {
  const mockGetDoc = vi.fn();
  return {
    mockCreateUserWithEmailAndPassword: vi.fn(),
    mockUpdateProfile: vi.fn(),
    mockSignOut: vi.fn(),
    mockUserDelete: vi.fn(),
    mockDoc: vi.fn(),
    mockGetDoc,
    mockWriteBatch: vi.fn(),
    mockServerTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
    mockHttpsCallable: vi.fn(() => vi.fn()),
  };
});

const mockSignInWithEmailAndPassword = vi.fn();
const mockSignInWithPopup = vi.fn();
const mockSignInWithRedirect = vi.fn();
const mockGetRedirectResult = vi.fn();
const mockSendPasswordResetEmail = vi.fn();
const mockLinkWithCredential = vi.fn();

vi.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: mockCreateUserWithEmailAndPassword,
  updateProfile: mockUpdateProfile,
  signOut: mockSignOut,
  signInWithEmailAndPassword: (...args: any[]) =>
    mockSignInWithEmailAndPassword(...args),
  signInWithPopup: (...args: any[]) => mockSignInWithPopup(...args),
  signInWithRedirect: (...args: any[]) => mockSignInWithRedirect(...args),
  getRedirectResult: (...args: any[]) => mockGetRedirectResult(...args),
  GoogleAuthProvider: vi.fn(function (this: any) {
    this.setCustomParameters = vi.fn();
  }),
  sendPasswordResetEmail: (...args: any[]) =>
    mockSendPasswordResetEmail(...args),
  EmailAuthProvider: { credential: vi.fn(() => "mock-cred") },
  linkWithCredential: (...args: any[]) => mockLinkWithCredential(...args),
}));

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    doc: mockDoc,
    getDoc: mockGetDoc,
    writeBatch: mockWriteBatch,
    serverTimestamp: mockServerTimestamp,
    Timestamp: { now: vi.fn() },
  };
});

vi.mock("@/shared/lib/firebase", () => ({
  auth: { name: "mock-auth" },
  db: { name: "mock-db" },
  functions: { name: "mock-functions" },
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: () => mockHttpsCallable(),
}));

vi.mock("@/shared/services/firestore/userRepository", () => ({
  userRepository: {
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    generateNextDisplayId: vi.fn(),
  },
}));

import { userRepository } from "@/shared/services/firestore/userRepository";
import {
  mapAuthError,
  signIn,
  signInWithGoogle,
  signUpCustomer,
  signOutUser,
  resetPassword,
  authenticateWithGoogleForSignup,
  signUpWithGoogle,
  cancelGoogleSignup,
  handleGoogleRedirectResult,
} from "../authService";

describe("authService - signUpCustomer Failure Injections", () => {
  let mockUser: any;
  let mockBatch: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockUser = {
      uid: "user-123",
      emailVerified: false,
      delete: mockUserDelete.mockResolvedValue(undefined),
    };

    mockCreateUserWithEmailAndPassword.mockResolvedValue({ user: mockUser });

    mockGetDoc.mockResolvedValue({ exists: () => false }); // Phone does not exist by default

    vi.mocked(userRepository.generateNextDisplayId).mockResolvedValue("MP-001");

    mockBatch = {
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    mockWriteBatch.mockReturnValue(mockBatch);

    mockUpdateProfile.mockResolvedValue(undefined);


  });

  it("cleans up and deletes Auth user if phone already exists", async () => {
    mockBatch.commit.mockRejectedValue({ code: "permission-denied" });

    await expect(
      signUpCustomer("test@test.com", "password", "Test User", "+1234567890"),
    ).rejects.toThrow("An account with this mobile number already exists");

    expect(mockUserDelete).toHaveBeenCalledTimes(1);
  });

  it("cleans up and deletes Auth user if generateNextDisplayId throws an error", async () => {
    vi.mocked(userRepository.generateNextDisplayId).mockRejectedValueOnce(
      new Error("ID generation failed"),
    );

    await expect(
      signUpCustomer("test@test.com", "password", "Test User", "+1234567890"),
    ).rejects.toThrow("ID generation failed");

    expect(mockUserDelete).toHaveBeenCalledTimes(1);
  });

  it("cleans up and deletes Auth user if updateProfile throws an error", async () => {
    mockUpdateProfile.mockRejectedValue(new Error("Profile update failed"));

    await expect(
      signUpCustomer("test@test.com", "password", "Test User", "+1234567890"),
    ).rejects.toThrow("Profile update failed");

    expect(mockUserDelete).toHaveBeenCalledTimes(1);
    // Batch commit shouldn't be called because updateProfile failed before batch was created
    expect(mockBatch.commit).not.toHaveBeenCalled();
  });

  it("cleans up and deletes Auth user if batch commit throws an error", async () => {
    mockBatch.commit.mockRejectedValue(new Error("Batch commit failed"));

    await expect(
      signUpCustomer("test@test.com", "password", "Test User", "9876543210"),
    ).rejects.toThrow("Batch commit failed");

    expect(mockUserDelete).toHaveBeenCalledTimes(1);
  });

  it("signs out the user if credential.user.delete() fails during cleanup", async () => {
    mockBatch.commit.mockRejectedValue(new Error("Batch commit failed"));
    mockUserDelete.mockRejectedValue(
      new Error("Auth user deletion failed (requires recent login)"),
    );

    await expect(
      signUpCustomer("test@test.com", "password", "Test User", "+1234567890"),
    ).rejects.toThrow("Batch commit failed");

    expect(mockUserDelete).toHaveBeenCalledTimes(1);
    // Fallback cleanup
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});

describe("authService - mapAuthError", () => {
  it("maps known error codes to user friendly copy", () => {
    expect(mapAuthError({ code: "auth/invalid-email" })).toBe(
      "That email address doesn't look right.",
    );
    expect(mapAuthError({ code: "auth/popup-closed-by-user" })).toBe(
      "Sign-in cancelled.",
    );
    expect(mapAuthError({ code: "auth/cancelled-popup-request" })).toBe(
      "Sign-in cancelled.",
    );
    expect(mapAuthError({ code: "auth/popup-blocked" })).toBe(
      "Popup was blocked by your browser. Please allow popups for this site and try again.",
    );
    expect(
      mapAuthError({ code: "auth/account-exists-with-different-credential" }),
    ).toBe(
      "An account already exists with the same email address but different sign-in credentials. Sign in using the original provider.",
    );
    expect(
      mapAuthError({ code: "auth/user-not-found" }, "resetPassword"),
    ).toBe("No account found with this email address.");
    expect(mapAuthError({ code: "auth/user-not-found" }, "login")).toBe(
      "Incorrect email or password.",
    );
    expect(mapAuthError({ code: "unknown-code", message: "Custom msg" })).toBe(
      "Custom msg",
    );
    expect(mapAuthError({})).toBe("Something went wrong. Please try again.");
  });
});

describe("authService - additional helper functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDoc.mockResolvedValue({ exists: () => false });


    const mockBatch = {
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    (mockWriteBatch as any).mockReturnValue(mockBatch);
  });

  it("signIn invokes signInWithEmailAndPassword", async () => {
    mockSignInWithEmailAndPassword.mockResolvedValue("mock-user-cred");
    await expect(signIn("test@example.com", "pass")).resolves.toBe(
      "mock-user-cred",
    );
  });

  it("signOutUser invokes firebaseSignOut", async () => {
    mockSignOut.mockResolvedValue(undefined);
    await signOutUser();
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("resetPassword invokes sendPasswordResetEmail", async () => {
    mockSendPasswordResetEmail.mockResolvedValue(undefined);
    await resetPassword("test@example.com");
    expect(mockSendPasswordResetEmail).toHaveBeenCalled();
  });

  it("authenticateWithGoogleForSignup runs popup and checks user profile", async () => {
    mockSignInWithPopup.mockResolvedValue({ user: { uid: "g1" } });
    await expect(authenticateWithGoogleForSignup()).resolves.toEqual({
      user: { uid: "g1" },
      exists: false,
    });
  });

  it("cancelGoogleSignup deletes user or signs out on error", async () => {
    const mockUserObj = { delete: vi.fn().mockResolvedValue(undefined) };
    await cancelGoogleSignup(mockUserObj);
    expect(mockUserObj.delete).toHaveBeenCalled();

    mockUserObj.delete.mockRejectedValue(new Error("delete failed"));
    await cancelGoogleSignup(mockUserObj);
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("signUpWithGoogle succeeds when email is present and transaction completes", async () => {
    mockLinkWithCredential.mockResolvedValue(undefined);
    mockGetDoc.mockResolvedValue({ exists: () => false });
    const mockGUser = {
      uid: "g123",
      email: "g@test.com",
      displayName: "G User",
      emailVerified: true,
      delete: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      signUpWithGoogle(mockGUser, "9876543210", "pass"),
    ).resolves.not.toThrow();
  });

  it("signUpWithGoogle throws if email is missing or cleanup on error", async () => {
    const mockGUser = {
      uid: "g123",
      delete: vi.fn().mockResolvedValue(undefined),
    };
    await expect(
      signUpWithGoogle(mockGUser, "9876543210", "pass"),
    ).rejects.toThrow("Google account is missing an email address.");

    const mockFailingBatch = {
      set: vi.fn(),
      commit: vi.fn().mockRejectedValue(new Error("Tx fail")),
    };
    (mockWriteBatch as any).mockReturnValue(mockFailingBatch);
    const mockGUser2 = {
      uid: "g123",
      email: "g@test.com",
      delete: vi.fn().mockRejectedValue(new Error("del fail")),
    };
    await expect(
      signUpWithGoogle(mockGUser2, "9876543210", "pass"),
    ).rejects.toThrow("Tx fail");

    const mockPermissionDeniedBatch = {
      set: vi.fn(),
      commit: vi.fn().mockRejectedValue({ code: "permission-denied" }),
    };
    (mockWriteBatch as any).mockReturnValue(mockPermissionDeniedBatch);
    const mockGUser3 = {
      uid: "g123",
      email: "g@test.com",
      delete: vi.fn().mockResolvedValue(undefined),
    };
    await expect(
      signUpWithGoogle(mockGUser3, "9876543210", "pass"),
    ).rejects.toThrow("An account with this mobile number already exists.");
  });

  it("signOutUser clears all auth_ and pwa_ from localStorage", async () => {
    localStorage.setItem("auth_cache_123", "val");
    localStorage.setItem("auth_session_token", "token-abc");
    localStorage.setItem("pwa_prompt", "val");
    localStorage.setItem("current_fcm_token", "token");
    localStorage.setItem("keep_me", "val");

    mockSignOut.mockResolvedValue(undefined);
    await signOutUser();

    expect(localStorage.getItem("auth_cache_123")).toBeNull();
    expect(localStorage.getItem("auth_session_token")).toBeNull();
    expect(localStorage.getItem("pwa_prompt")).toBeNull();
    expect(localStorage.getItem("current_fcm_token")).toBeNull();
    expect(localStorage.getItem("keep_me")).toBe("val");
  });

  it("signInWithGoogle creates a profile if non-existent or updates if existing", async () => {
    mockSignInWithPopup.mockResolvedValue({
      user: { uid: "g123", email: "g@test.com", displayName: "G" },
    });
    await signInWithGoogle();
    expect(mockSignInWithPopup).toHaveBeenCalled();
  });

  it("signInWithGoogle falls back to signInWithRedirect when popup is blocked", async () => {
    mockSignInWithPopup.mockRejectedValueOnce({
      code: "auth/popup-blocked",
      message: "Popup blocked by browser",
    });
    mockSignInWithRedirect.mockResolvedValueOnce(undefined);

    await signInWithGoogle();
    expect(mockSignInWithPopup).toHaveBeenCalled();
    expect(mockSignInWithRedirect).toHaveBeenCalled();
  });

  it("signInWithGoogle falls back to signInWithRedirect when popup is not supported in environment", async () => {
    mockSignInWithPopup.mockRejectedValueOnce({
      code: "auth/operation-not-supported-in-this-environment",
      message: "Operation not supported",
    });
    mockSignInWithRedirect.mockResolvedValueOnce(undefined);

    await signInWithGoogle();
    expect(mockSignInWithPopup).toHaveBeenCalled();
    expect(mockSignInWithRedirect).toHaveBeenCalled();
  });

  it("signInWithGoogle calls signInWithRedirect directly in standalone PWA mode", async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(display-mode: standalone)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    try {
      mockSignInWithRedirect.mockResolvedValueOnce(undefined);
      await signInWithGoogle();
      expect(mockSignInWithPopup).not.toHaveBeenCalled();
      expect(mockSignInWithRedirect).toHaveBeenCalled();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("signInWithGoogle re-throws unexpected popup errors", async () => {
    mockSignInWithPopup.mockRejectedValueOnce({
      code: "auth/network-request-failed",
      message: "Network error",
    });

    await expect(signInWithGoogle()).rejects.toEqual(
      expect.objectContaining({ code: "auth/network-request-failed" }),
    );
    expect(mockSignInWithRedirect).not.toHaveBeenCalled();
  });

  it("handleGoogleRedirectResult returns null when getRedirectResult returns null (no redirect occurred)", async () => {
    mockGetRedirectResult.mockResolvedValueOnce(null);
    const result = await handleGoogleRedirectResult();
    expect(result).toBeNull();
    expect(mockGetRedirectResult).toHaveBeenCalled();
  });

  it("handleGoogleRedirectResult returns credential and completes finishGoogleLogin when redirect succeeds", async () => {
    const mockUser = {
      uid: "redir-123",
      email: "redir@test.com",
      displayName: "Redirect User",
    };
    const mockCred = { user: mockUser };
    mockGetRedirectResult.mockResolvedValueOnce(mockCred);
    vi.mocked(userRepository.getById).mockResolvedValueOnce(null);
    vi.mocked(userRepository.generateNextDisplayId).mockResolvedValueOnce("MP-099");
    vi.mocked(userRepository.create).mockResolvedValueOnce(undefined as any);

    const result = await handleGoogleRedirectResult();
    expect(result).toEqual(mockCred);
    expect(userRepository.getById).toHaveBeenCalledWith("redir-123");
    expect(userRepository.create).toHaveBeenCalled();
  });

  it("handleGoogleRedirectResult updates profile if existing and returns credential", async () => {
    const mockUser = {
      uid: "redir-existing",
      email: "redir@test.com",
      displayName: "Existing User",
    };
    const mockCred = { user: mockUser };
    mockGetRedirectResult.mockResolvedValueOnce(mockCred);
    vi.mocked(userRepository.getById).mockResolvedValueOnce({
      id: "redir-existing",
      displayId: "MP-010",
      role: "customer",
      googleConnected: false,
    } as any);
    vi.mocked(userRepository.update).mockResolvedValueOnce(undefined as any);

    const result = await handleGoogleRedirectResult();
    expect(result).toEqual(mockCred);
    expect(userRepository.update).toHaveBeenCalledWith("redir-existing", expect.objectContaining({
      googleConnected: true,
    }));
  });
});

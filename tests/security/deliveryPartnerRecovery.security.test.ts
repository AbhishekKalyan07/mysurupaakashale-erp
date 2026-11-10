import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  generateSecureTemporaryPassword,
  maskEmail,
  maskPhone,
  verifyTargetDeliveryPartner,
  executeDeliveryPartnerPasswordReset,
  initializeAdminContext,
  getAdcCredentialsPath,
  AccountNotFoundError,
  InvalidRoleError,
  AccountDeactivatedError,
  AuthUserNotFoundError,
  ConfirmationRequiredError,
  OperatorUnauthorizedError,
  SafetyAbortError,
  AuditInitiationError,
  AuthMutationError,
  IndeterminateRecoveryError,
  PartialRecoveryAuditFailureError,
  type RecoveryOutcome,
} from '../../scripts/admin/deliveryPartnerRecovery';

describe('Delivery Partner Recovery — Security & Verification', () => {
  describe('Credential Generation & Privacy Masking', () => {
    it('generates a strong temporary password meeting security requirements', () => {
      const password = generateSecureTemporaryPassword(14);
      expect(password).toHaveLength(14);

      // Must contain at least uppercase, lowercase, digit, and symbol
      expect(/[A-Z]/.test(password)).toBe(true);
      expect(/[a-z]/.test(password)).toBe(true);
      expect(/[0-9]/.test(password)).toBe(true);
      expect(/[!@#$%*+\-=]/.test(password)).toBe(true);

      // Must not contain ambiguous characters
      expect(/[0Oo1lI\s]/.test(password)).toBe(false);
    });

    it('generates distinct, non-deterministic passwords across invocations', () => {
      const p1 = generateSecureTemporaryPassword(14);
      const p2 = generateSecureTemporaryPassword(14);
      const p3 = generateSecureTemporaryPassword(14);

      expect(p1).not.toBe(p2);
      expect(p2).not.toBe(p3);
      expect(p1).not.toBe(p3);
    });

    it('masks email addresses accurately without exposing full mailbox names', () => {
      expect(maskEmail('delivery.partner@example.com')).toBe('d***r@example.com');
      expect(maskEmail('dp@example.com')).toBe('d***@example.com');
      expect(maskEmail('a@b.com')).toBe('a***@b.com');
      expect(maskEmail('')).toBe('***');
      expect(maskEmail('invalid-email')).toBe('***');
    });

    it('masks phone numbers accurately', () => {
      expect(maskPhone('+919876543210')).toBe('+91*****10');
      expect(maskPhone('9876543210')).toBe('987*****10');
      expect(maskPhone('')).toBe('***');
    });
  });

  describe('verifyTargetDeliveryPartner — Role Boundaries & Account Validation', () => {
    let mockAuth: any;
    let mockDb: any;
    let userDocData: any;
    let userDocExists: boolean;
    let authUserData: any;
    let authUserExists: boolean;

    beforeEach(() => {
      userDocExists = true;
      userDocData = {
        role: 'delivery_partner',
        displayName: 'Ravi Delivery',
        email: 'ravi.delivery@mysurupaakashale.com',
        phone: '+919876543210',
        staffId: 'STF-005',
        zoneIds: ['zone-1', 'zone-2'],
        isActive: true,
      };

      authUserExists = true;
      authUserData = {
        uid: 'target-partner-uid',
        email: 'ravi.delivery@mysurupaakashale.com',
        displayName: 'Ravi Delivery',
        phoneNumber: '+919876543210',
        disabled: false,
      };

      mockDb = {
        collection: vi.fn((colName: string) => ({
          doc: vi.fn((docId: string) => ({
            get: vi.fn(async () => ({
              exists: userDocExists,
              data: () => (userDocExists ? userDocData : undefined),
            })),
          })),
        })),
      };

      mockAuth = {
        getUser: vi.fn(async (uid: string) => {
          if (!authUserExists) {
            const err: any = new Error('User not found');
            err.code = 'auth/user-not-found';
            throw err;
          }
          return authUserData;
        }),
      };
    });

    it('rejects empty or whitespace target UID', async () => {
      await expect(verifyTargetDeliveryPartner(mockAuth, mockDb, '')).rejects.toThrow(SafetyAbortError);
      await expect(verifyTargetDeliveryPartner(mockAuth, mockDb, '   ')).rejects.toThrow(SafetyAbortError);
    });

    it('rejects target when Firestore user document does not exist', async () => {
      userDocExists = false;
      await expect(verifyTargetDeliveryPartner(mockAuth, mockDb, 'nonexistent-uid')).rejects.toThrow(
        AccountNotFoundError
      );
    });

    it('rejects target account when role is customer (Strict Role Boundary)', async () => {
      userDocData.role = 'customer';
      await expect(verifyTargetDeliveryPartner(mockAuth, mockDb, 'target-partner-uid')).rejects.toThrow(
        InvalidRoleError
      );
    });

    it('rejects target account when role is admin (Privilege Protection)', async () => {
      userDocData.role = 'admin';
      await expect(verifyTargetDeliveryPartner(mockAuth, mockDb, 'target-partner-uid')).rejects.toThrow(
        InvalidRoleError
      );
    });

    it('rejects target account when role is kitchen (Strict Role Boundary)', async () => {
      userDocData.role = 'kitchen';
      await expect(verifyTargetDeliveryPartner(mockAuth, mockDb, 'target-partner-uid')).rejects.toThrow(
        InvalidRoleError
      );
    });

    it('rejects target account when role is accounts (Strict Role Boundary)', async () => {
      userDocData.role = 'accounts';
      await expect(verifyTargetDeliveryPartner(mockAuth, mockDb, 'target-partner-uid')).rejects.toThrow(
        InvalidRoleError
      );
    });

    it('rejects target delivery partner when deactivated (isActive === false)', async () => {
      userDocData.isActive = false;
      await expect(verifyTargetDeliveryPartner(mockAuth, mockDb, 'target-partner-uid')).rejects.toThrow(
        AccountDeactivatedError
      );
    });

    it('rejects target when Firebase Auth identity does not exist', async () => {
      authUserExists = false;
      await expect(verifyTargetDeliveryPartner(mockAuth, mockDb, 'target-partner-uid')).rejects.toThrow(
        AuthUserNotFoundError
      );
    });

    it('rejects target when Firebase Auth account is disabled', async () => {
      authUserData.disabled = true;
      await expect(verifyTargetDeliveryPartner(mockAuth, mockDb, 'target-partner-uid')).rejects.toThrow(
        AccountDeactivatedError
      );
    });

    it('successfully validates an active delivery partner and returns sanitized profile', async () => {
      const result = await verifyTargetDeliveryPartner(mockAuth, mockDb, 'target-partner-uid');

      expect(result.uid).toBe('target-partner-uid');
      expect(result.role).toBe('delivery_partner');
      expect(result.displayName).toBe('Ravi Delivery');
      expect(result.staffId).toBe('STF-005');
      expect(result.zoneIds).toEqual(['zone-1', 'zone-2']);
      expect(result.isActive).toBe(true);
      expect(result.emailMasked).toBe('r***y@mysurupaakashale.com');
      expect(result.phoneMasked).toBe('+91*****10');
    });
  });

  describe('executeDeliveryPartnerPasswordReset — Recovery Execution & Safety Guarantees', () => {
    let mockAuth: any;
    let mockDb: any;
    let userDocData: any;
    let auditLogEntries: any[];
    let userDocWrites: any[];

    beforeEach(() => {
      auditLogEntries = [];
      userDocWrites = [];

      userDocData = {
        role: 'delivery_partner',
        displayName: 'Ravi Delivery',
        email: 'ravi.delivery@mysurupaakashale.com',
        phone: '+919876543210',
        staffId: 'STF-005',
        zoneIds: ['zone-1'],
        isActive: true,
      };

      mockDb = {
        collection: vi.fn((colName: string) => {
          if (colName === 'users') {
            return {
              doc: vi.fn((docId: string) => ({
                get: vi.fn(async () => ({
                  exists: true,
                  data: () => userDocData,
                })),
                set: vi.fn(async (data: any) => userDocWrites.push({ docId, data, method: 'set' })),
                update: vi.fn(async (data: any) => userDocWrites.push({ docId, data, method: 'update' })),
              })),
            };
          }
          if (colName === 'auditLogs') {
            return {
              add: vi.fn(async (entry: any) => {
                auditLogEntries.push(entry);
                return { id: `audit-${auditLogEntries.length}` };
              }),
            };
          }
          return {
            doc: vi.fn(() => ({})),
            add: vi.fn(async () => ({ id: 'mock-id' })),
          };
        }),
      };

      mockAuth = {
        getUser: vi.fn(async () => ({
          uid: 'partner-uid-123',
          email: 'ravi.delivery@mysurupaakashale.com',
          displayName: 'Ravi Delivery',
          disabled: false,
        })),
        updateUser: vi.fn(async () => ({
          uid: 'partner-uid-123',
        })),
      };
    });

    it('fails closed when operator explicit confirmation is missing (confirm: false)', async () => {
      await expect(
        executeDeliveryPartnerPasswordReset({
          auth: mockAuth,
          db: mockDb,
          targetUid: 'partner-uid-123',
          operator: { id: 'admin-uid', name: 'Admin User', role: 'admin' },
          confirm: false,
          expectedProjectId: 'mysuru-paakashale-erp',
        })
      ).rejects.toThrow(ConfirmationRequiredError);

      expect(mockAuth.updateUser).not.toHaveBeenCalled();
      expect(auditLogEntries).toHaveLength(0);
      expect(userDocWrites).toHaveLength(0);
    });

    it('fails closed when operator is not an admin', async () => {
      await expect(
        executeDeliveryPartnerPasswordReset({
          auth: mockAuth,
          db: mockDb,
          targetUid: 'partner-uid-123',
          operator: { id: 'staff-uid', name: 'Kitchen Staff', role: 'kitchen' },
          confirm: true,
          expectedProjectId: 'mysuru-paakashale-erp',
        })
      ).rejects.toThrow(OperatorUnauthorizedError);

      expect(mockAuth.updateUser).not.toHaveBeenCalled();
      expect(auditLogEntries).toHaveLength(0);
      expect(userDocWrites).toHaveLength(0);
    });

    it('fails closed when expectedProjectId is missing', async () => {
      await expect(
        executeDeliveryPartnerPasswordReset({
          auth: mockAuth,
          db: mockDb,
          targetUid: 'partner-uid-123',
          operator: { id: 'admin-uid', name: 'Admin User', role: 'admin' },
          confirm: true,
          expectedProjectId: '',
        })
      ).rejects.toThrow(SafetyAbortError);

      expect(mockAuth.updateUser).not.toHaveBeenCalled();
    });

    it('dryRun validates target without modifying password or creating audit entries', async () => {
      const result = await executeDeliveryPartnerPasswordReset({
        auth: mockAuth,
        db: mockDb,
        targetUid: 'partner-uid-123',
        operator: { id: 'admin-uid', name: 'Admin User', role: 'admin' },
        confirm: true,
        dryRun: true,
        expectedProjectId: 'mysuru-paakashale-erp',
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.temporaryPassword).toBeUndefined();
      expect(mockAuth.updateUser).not.toHaveBeenCalled();
      expect(auditLogEntries).toHaveLength(0);
      expect(userDocWrites).toHaveLength(0);
    });

    it('successfully executes password reset, preserves user document, and records two-phase audit log', async () => {
      const result = await executeDeliveryPartnerPasswordReset({
        auth: mockAuth,
        db: mockDb,
        targetUid: 'partner-uid-123',
        operator: { id: 'admin-uid', name: 'Admin User', role: 'admin' },
        confirm: true,
        dryRun: false,
        expectedProjectId: 'mysuru-paakashale-erp',
      });

      expect(result.success).toBe(true);
      expect(result.outcome).toBe('SUCCESS_COMPLETE');
      expect(result.initiationAuditId).toBe('audit-1');
      expect(result.completionAuditId).toBe('audit-2');
      expect(result.dryRun).toBe(false);
      expect(result.targetUid).toBe('partner-uid-123');
      expect(result.temporaryPassword).toBeDefined();
      expect(result.temporaryPassword!.length).toBe(14);

      // Verify Firebase Auth updateUser call
      expect(mockAuth.updateUser).toHaveBeenCalledTimes(1);
      expect(mockAuth.updateUser).toHaveBeenCalledWith('partner-uid-123', {
        password: result.temporaryPassword,
      });

      // ZERO writes to /users/{uid} document
      expect(userDocWrites).toHaveLength(0);

      // Verify audit log entries: Phase 1 (Initiation) + Phase 2 (Completion)
      expect(auditLogEntries).toHaveLength(2);

      const initAudit = auditLogEntries[0];
      expect(initAudit.action).toBe('admin_delivery_partner_password_reset_initiated');
      expect(initAudit.details.stage).toBe('initiated');
      expect(initAudit.details.status).toBe('pending_auth_update');
      expect(initAudit.entityType).toBe('user');
      expect(initAudit.entityId).toBe('partner-uid-123');
      expect(initAudit.performedBy).toBe('admin-uid');
      expect(initAudit.performedByRole).toBe('admin');
      expect(initAudit.performedByName).toBe('Admin User');
      expect(initAudit.details.targetRole).toBe('delivery_partner');
      expect(initAudit.details.targetStaffId).toBe('STF-005');
      expect(initAudit.details.targetEmailMasked).toBe('r***y@mysurupaakashale.com');

      const completionAudit = auditLogEntries[1];
      expect(completionAudit.action).toBe('admin_delivery_partner_password_reset');
      expect(completionAudit.details.stage).toBe('completed');
      expect(completionAudit.details.status).toBe('password_updated');
      expect(completionAudit.entityType).toBe('user');
      expect(completionAudit.entityId).toBe('partner-uid-123');
      expect(completionAudit.performedBy).toBe('admin-uid');
      expect(completionAudit.performedByRole).toBe('admin');
      expect(completionAudit.performedByName).toBe('Admin User');
      expect(completionAudit.details.targetRole).toBe('delivery_partner');
      expect(completionAudit.details.targetStaffId).toBe('STF-005');
      expect(completionAudit.details.targetEmailMasked).toBe('r***y@mysurupaakashale.com');
      expect(completionAudit.details.initiationAuditId).toBe('audit-1');

      // CRITICAL: Ensure temporary password is NEVER persisted in any audit log
      expect(JSON.stringify(auditLogEntries)).not.toContain(result.temporaryPassword);
      expect(initAudit.details.temporaryPassword).toBeUndefined();
      expect(initAudit.details.password).toBeUndefined();
      expect(completionAudit.details.temporaryPassword).toBeUndefined();
      expect(completionAudit.details.password).toBeUndefined();
    });

    it('fails closed when pre-mutation audit initiation fails and prevents Auth mutation', async () => {
      const dbWithFailingAudit = {
        ...mockDb,
        collection: (col: string) => {
          if (col === 'auditLogs') {
            return {
              add: vi.fn().mockRejectedValueOnce(new Error('Firestore connection refused')),
            };
          }
          return mockDb.collection(col);
        },
      };

      let thrownErr: any;
      try {
        await executeDeliveryPartnerPasswordReset({
          auth: mockAuth,
          db: dbWithFailingAudit,
          targetUid: 'partner-uid-123',
          operator: { id: 'admin-uid', name: 'Admin User', role: 'admin' },
          confirm: true,
          expectedProjectId: 'mysuru-paakashale-erp',
        });
      } catch (err) {
        thrownErr = err;
      }

      expect(thrownErr).toBeInstanceOf(AuditInitiationError);
      expect(thrownErr.outcome).toBe('FAILED_PRE_MUTATION');
      expect(thrownErr.message).toContain('Audit initiation failed: Unable to record pre-mutation audit log');

      // Crucial: Auth updateUser was NEVER called because audit establishment failed
      expect(mockAuth.updateUser).not.toHaveBeenCalled();
      expect(userDocWrites).toHaveLength(0);
      expect(auditLogEntries).toHaveLength(0);
    });

    it('handles definitive Auth updateUser failure by recording failure audit and throwing AuthMutationError', async () => {
      mockAuth.updateUser.mockRejectedValueOnce(
        Object.assign(new Error('auth/user-disabled: The user account has been disabled'), {
          code: 'auth/user-disabled',
        })
      );

      let thrownErr: any;
      try {
        await executeDeliveryPartnerPasswordReset({
          auth: mockAuth,
          db: mockDb,
          targetUid: 'partner-uid-123',
          operator: { id: 'admin-uid', name: 'Admin User', role: 'admin' },
          confirm: true,
          expectedProjectId: 'mysuru-paakashale-erp',
        });
      } catch (err) {
        thrownErr = err;
      }

      expect(thrownErr).toBeInstanceOf(AuthMutationError);
      expect(thrownErr.outcome).toBe('FAILED_PRE_MUTATION');
      expect(thrownErr.message).toContain('Firebase Authentication update failed');

      // Called once, never blindly retried
      expect(mockAuth.updateUser).toHaveBeenCalledTimes(1);
      expect(userDocWrites).toHaveLength(0);

      // Audit entries: 1 initiation + 1 failure record
      expect(auditLogEntries).toHaveLength(2);
      expect(auditLogEntries[0].action).toBe('admin_delivery_partner_password_reset_initiated');
      expect(auditLogEntries[0].details.stage).toBe('initiated');
      expect(auditLogEntries[1].action).toBe('admin_delivery_partner_password_reset_failed');
      expect(auditLogEntries[1].details.stage).toBe('auth_failed');
      expect(auditLogEntries[1].details.errorMessage).toContain('auth/user-disabled');

      // Temporary password NEVER in logs
      expect(JSON.stringify(auditLogEntries)).not.toContain('temporaryPassword');
    });

    it('detects indeterminate Auth failures (network timeout/socket drop) without repeating the mutation', async () => {
      mockAuth.updateUser.mockRejectedValueOnce(
        Object.assign(new Error('Connection reset by peer: ECONNRESET'), {
          code: 'ECONNRESET',
        })
      );

      let thrownErr: any;
      try {
        await executeDeliveryPartnerPasswordReset({
          auth: mockAuth,
          db: mockDb,
          targetUid: 'partner-uid-123',
          operator: { id: 'admin-uid', name: 'Admin User', role: 'admin' },
          confirm: true,
          expectedProjectId: 'mysuru-paakashale-erp',
        });
      } catch (err) {
        thrownErr = err;
      }

      expect(thrownErr).toBeInstanceOf(IndeterminateRecoveryError);
      expect(thrownErr.outcome).toBe('INDETERMINATE');
      expect(thrownErr.temporaryPassword).toBeDefined();
      expect(thrownErr.temporaryPassword.length).toBe(14);
      expect(thrownErr.targetUid).toBe('partner-uid-123');
      expect(thrownErr.profile.staffId).toBe('STF-005');
      expect(thrownErr.message).toContain('indeterminate error');

      // UpdateUser called EXACTLY ONCE; must not be blindly re-executed
      expect(mockAuth.updateUser).toHaveBeenCalledTimes(1);
      expect(userDocWrites).toHaveLength(0);

      // Audit entries: 1 initiation + 1 failure record with indeterminate flag
      expect(auditLogEntries).toHaveLength(2);
      expect(auditLogEntries[1].action).toBe('admin_delivery_partner_password_reset_indeterminate');
      expect(auditLogEntries[1].details.stage).toBe('indeterminate');
      expect(auditLogEntries[1].details.status).toBe('password_update_indeterminate');

      // Credential NOT exposed in audit logs
      expect(JSON.stringify(auditLogEntries)).not.toContain(thrownErr.temporaryPassword);
    });

    it('handles post-mutation audit write failure gracefully without reporting false reset failure', async () => {
      let callCount = 0;
      const dbWithFailingCompletionAudit = {
        ...mockDb,
        collection: (col: string) => {
          if (col === 'auditLogs') {
            return {
              add: vi.fn(async (entry: any) => {
                callCount++;
                if (callCount === 1) {
                  auditLogEntries.push(entry);
                  return { id: 'audit-init-101' };
                }
                throw new Error('Firestore deadline exceeded: completion audit write failed');
              }),
            };
          }
          return mockDb.collection(col);
        },
      };

      const result = await executeDeliveryPartnerPasswordReset({
        auth: mockAuth,
        db: dbWithFailingCompletionAudit,
        targetUid: 'partner-uid-123',
        operator: { id: 'admin-uid', name: 'Admin User', role: 'admin' },
        confirm: true,
        dryRun: false,
        expectedProjectId: 'mysuru-paakashale-erp',
      });

      // The password update SUCCEEDED, so success is true but outcome clearly indicates audit failure
      expect(result.success).toBe(true);
      expect(result.outcome).toBe('SUCCESS_AUDIT_FAILED');
      expect(result.targetUid).toBe('partner-uid-123');

      // CRITICAL: Temporary password is NOT lost! It is returned to the operator
      expect(result.temporaryPassword).toBeDefined();
      expect(result.temporaryPassword!.length).toBe(14);
      expect(result.initiationAuditId).toBe('audit-init-101');
      expect(result.completionAuditId).toBeUndefined();
      expect(result.auditError).toContain('Firestore deadline exceeded');

      // Auth updateUser was called exactly once and NEVER retried
      expect(mockAuth.updateUser).toHaveBeenCalledTimes(1);
      expect(mockAuth.updateUser).toHaveBeenCalledWith('partner-uid-123', {
        password: result.temporaryPassword,
      });

      // Exactly 1 audit entry recorded (initiation)
      expect(auditLogEntries).toHaveLength(1);
      expect(auditLogEntries[0].action).toBe('admin_delivery_partner_password_reset_initiated');
      expect(JSON.stringify(auditLogEntries)).not.toContain(result.temporaryPassword);
      expect(userDocWrites).toHaveLength(0);
    });

    it('throws PartialRecoveryAuditFailureError with preserved credentials when throwOnAuditFailure is true', async () => {
      let callCount = 0;
      const dbWithFailingCompletionAudit = {
        ...mockDb,
        collection: (col: string) => {
          if (col === 'auditLogs') {
            return {
              add: vi.fn(async (entry: any) => {
                callCount++;
                if (callCount === 1) {
                  auditLogEntries.push(entry);
                  return { id: 'audit-init-202' };
                }
                throw new Error('Firestore disk error');
              }),
            };
          }
          return mockDb.collection(col);
        },
      };

      let thrownErr: any;
      try {
        await executeDeliveryPartnerPasswordReset({
          auth: mockAuth,
          db: dbWithFailingCompletionAudit,
          targetUid: 'partner-uid-123',
          operator: { id: 'admin-uid', name: 'Admin User', role: 'admin' },
          confirm: true,
          throwOnAuditFailure: true,
          expectedProjectId: 'mysuru-paakashale-erp',
        });
      } catch (err) {
        thrownErr = err;
      }

      expect(thrownErr).toBeInstanceOf(PartialRecoveryAuditFailureError);
      expect(thrownErr.outcome).toBe('SUCCESS_AUDIT_FAILED');
      expect(thrownErr.temporaryPassword).toBeDefined();
      expect(thrownErr.initiationAuditId).toBe('audit-init-202');
      expect(thrownErr.targetUid).toBe('partner-uid-123');
      expect(thrownErr.message).toContain('Password was successfully updated in Firebase Authentication, but writing the completion audit log failed');
    });

    it('preserves target profile data, staffId, phone, and zone assignments without modifications during recovery', async () => {
      const originalProfileCopy = { ...userDocData };

      const result = await executeDeliveryPartnerPasswordReset({
        auth: mockAuth,
        db: mockDb,
        targetUid: 'partner-uid-123',
        operator: { id: 'admin-uid', name: 'Admin User', role: 'admin' },
        confirm: true,
        expectedProjectId: 'mysuru-paakashale-erp',
      });

      expect(result.success).toBe(true);
      expect(result.outcome).toBe('SUCCESS_COMPLETE');

      // The profile in userDocData must be 100% unchanged
      expect(userDocData.role).toBe('delivery_partner');
      expect(userDocData.isActive).toBe(true);
      expect(userDocData.staffId).toBe('STF-005');
      expect(userDocData.phone).toBe('+919876543210');
      expect(userDocData.zoneIds).toEqual(['zone-1']);
      expect(userDocData).toEqual(originalProfileCopy);

      // Zero doc writes occurred to /users
      expect(userDocWrites).toHaveLength(0);
    });
  });

  describe('initializeAdminContext — Safety & Credential Validation', () => {
    it('rejects empty project ID with SafetyAbortError', async () => {
      await expect(initializeAdminContext('')).rejects.toThrow(SafetyAbortError);
      await expect(initializeAdminContext('   ')).rejects.toThrow(SafetyAbortError);
    });

    it('fails closed when no credentials or emulators are available and guides operator on ADC login', async () => {
      const oldEnv = { ...process.env };
      delete process.env.VITE_USE_FIREBASE_EMULATORS;
      delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
      delete process.env.FIRESTORE_EMULATOR_HOST;
      delete process.env.FIREBASE_SERVICE_ACCOUNT;
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      process.env.USERPROFILE = 'nonexistent-directory-xyz';
      process.env.HOME = 'nonexistent-directory-xyz';
      delete process.env.APPDATA;

      try {
        let thrownError: any;
        try {
          await initializeAdminContext('target-project-id');
        } catch (err) {
          thrownError = err;
        }

        expect(thrownError).toBeInstanceOf(SafetyAbortError);
        expect(thrownError.message).toContain('gcloud auth application-default login');
        expect(thrownError.message).toContain('roles/firebaseauth.admin');
        expect(thrownError.message).toContain('roles/datastore.user');
      } finally {
        process.env = oldEnv;
      }
    });

    it('initializes in emulator mode when forceEmulator or emulator host is set', async () => {
      const ctx = await initializeAdminContext('test-emulator-project', {
        forceEmulator: true,
        appName: 'test-emulator-app-' + Date.now(),
      });

      expect(ctx.authMode).toBe('emulator');
      expect(ctx.projectId).toBe('test-emulator-project');
      expect(ctx.operator.role).toBe('admin');
      expect(ctx.auth).toBeDefined();
      expect(ctx.db).toBeDefined();
    });

    it('initializes with service account credentials when FIREBASE_SERVICE_ACCOUNT is set', async () => {
      const oldEnv = { ...process.env };
      const { privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      const dummySa = {
        type: 'service_account',
        project_id: 'test-sa-project',
        private_key_id: 'key-id-123',
        private_key: privateKey,
        client_email: 'recovery-operator@test-sa-project.iam.gserviceaccount.com',
      };
      process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(dummySa);
      delete process.env.VITE_USE_FIREBASE_EMULATORS;
      delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
      delete process.env.FIRESTORE_EMULATOR_HOST;

      try {
        const ctx = await initializeAdminContext('test-sa-project', {
          appName: 'test-sa-app-' + Date.now(),
        });

        expect(ctx.authMode).toBe('service_account');
        expect(ctx.projectId).toBe('test-sa-project');
        expect(ctx.operator.id).toBe('recovery-operator@test-sa-project.iam.gserviceaccount.com');
        expect(ctx.operator.role).toBe('admin');
      } finally {
        process.env = oldEnv;
      }
    });

    it('rejects service account with project mismatch', async () => {
      const oldEnv = { ...process.env };
      const dummySa = {
        type: 'service_account',
        project_id: 'other-project-id',
        private_key: 'fake-key',
        client_email: 'op@other-project-id.iam.gserviceaccount.com',
      };
      process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(dummySa);
      delete process.env.VITE_USE_FIREBASE_EMULATORS;
      delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
      delete process.env.FIRESTORE_EMULATOR_HOST;

      try {
        await expect(
          initializeAdminContext('expected-project-id', { appName: 'test-mismatch-app' })
        ).rejects.toThrow(SafetyAbortError);
      } finally {
        process.env = oldEnv;
      }
    });

    it('initializes in ADC mode when ADC credentials file exists', async () => {
      const oldEnv = { ...process.env };
      const tmpDir = path.join(os.tmpdir(), `test-adc-${Date.now()}`);
      fs.mkdirSync(tmpDir, { recursive: true });
      const mockAdcPath = path.join(tmpDir, 'mock_adc.json');
      fs.writeFileSync(
        mockAdcPath,
        JSON.stringify({
          account: 'admin.operator@mysurupaakashale.com',
          client_id: 'mock-client-id',
          client_secret: 'mock-secret',
          refresh_token: 'mock-refresh-token',
          type: 'authorized_user',
        })
      );

      delete process.env.VITE_USE_FIREBASE_EMULATORS;
      delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
      delete process.env.FIRESTORE_EMULATOR_HOST;
      delete process.env.FIREBASE_SERVICE_ACCOUNT;
      process.env.GOOGLE_APPLICATION_CREDENTIALS = mockAdcPath;

      try {
        const detectedPath = getAdcCredentialsPath();
        expect(detectedPath).toBe(mockAdcPath);

        const ctx = await initializeAdminContext('mysuru-paakashale-erp', {
          appName: 'test-adc-app-' + Date.now(),
        });

        expect(ctx.authMode).toBe('adc');
        expect(ctx.projectId).toBe('mysuru-paakashale-erp');
        expect(ctx.operator.id).toBe('admin.operator@mysurupaakashale.com');
        expect(ctx.operator.name).toBe('admin.operator@mysurupaakashale.com');
        expect(ctx.operator.role).toBe('admin');
        expect(ctx.auth).toBeDefined();
        expect(ctx.db).toBeDefined();
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        process.env = oldEnv;
      }
    });

    it('rejects ADC credentials when project_id is specified and mismatches target', async () => {
      const oldEnv = { ...process.env };
      const tmpDir = path.join(os.tmpdir(), `test-adc-mismatch-${Date.now()}`);
      fs.mkdirSync(tmpDir, { recursive: true });
      const mockAdcPath = path.join(tmpDir, 'mock_adc.json');
      fs.writeFileSync(
        mockAdcPath,
        JSON.stringify({
          account: 'admin.operator@mysurupaakashale.com',
          project_id: 'wrong-project-123',
          type: 'authorized_user',
        })
      );

      delete process.env.VITE_USE_FIREBASE_EMULATORS;
      delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
      delete process.env.FIRESTORE_EMULATOR_HOST;
      delete process.env.FIREBASE_SERVICE_ACCOUNT;
      process.env.GOOGLE_APPLICATION_CREDENTIALS = mockAdcPath;

      try {
        await expect(
          initializeAdminContext('mysuru-paakashale-erp', {
            appName: 'test-adc-mismatch-' + Date.now(),
          })
        ).rejects.toThrow(/Target project mismatch/);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        process.env = oldEnv;
      }
    });
  });
});

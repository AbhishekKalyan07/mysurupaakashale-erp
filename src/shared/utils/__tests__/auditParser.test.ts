import { describe, it, expect } from 'vitest';
import { parseAuditLogDetails } from '../auditParser';

describe('auditParser', () => {
  it('should pass through normal object details without flagging as raw dump', () => {
    const details = { action: 'user_created', userId: '123', message: 'Hello' };
    const result = parseAuditLogDetails(details);
    
    expect(result.isRawDump).toBe(false);
    expect(result.cleanDetails).toEqual(details);
  });

  it('should parse a raw script/code dump into a structured SystemAuditReport and obscure the raw string', () => {
    const rawDump = `
      stdout | src/shared/services/business/__tests__/orderService.test.ts > orderService
      ✓ generateDailyOrders
      ✓ cancelOrders
      ✗ syncCustomerActiveOrders
      
      # Summary
      Automated system audit completed with warnings.
      
      # Checks Performed
      * Database integrity
      * Payment sync
      
      # Issues Found
      * syncCustomerActiveOrders failed due to timeout
      
      # Recommendations
      * Check network connectivity to Firestore
    `;

    // Wrap the raw string inside an object similar to what a badly structured log might do
    const details = { scriptOutput: rawDump, status: 'completed' };
    
    const result = parseAuditLogDetails(details);
    
    expect(result.isRawDump).toBe(true);
    expect(result.report).toBeDefined();
    
    // Status should be parsed from the failed test
    expect(result.report?.status).toBe('failed');
    
    expect(result.report?.summary).toContain('Automated system audit completed with warnings.');
    
    expect(result.report?.checksPerformed).toContain('Database integrity');
    expect(result.report?.checksPerformed).toContain('Payment sync');
    
    expect(result.report?.issuesFound).toContain('syncCustomerActiveOrders failed due to timeout');
    
    expect(result.report?.recommendations).toContain('Check network connectivity to Firestore');
    
    expect(result.report?.tests).toEqual([
      { name: 'generateDailyOrders', status: 'passed' },
      { name: 'cancelOrders', status: 'passed' },
      { name: 'syncCustomerActiveOrders', status: 'failed' }
    ]);
    
    // Test files checked mapping
    expect(result.report?.filesChecked.some(f => f.includes('orderService.test.ts'))).toBe(true);

    // Verify raw output is removed from cleanDetails
    expect(result.cleanDetails.scriptOutput).toBe('[Parsed Structured Report]');
  });
  
  it('should parse simple raw strings directly', () => {
    const rawDump = "stdout | tests/active-backend/foo.ts > bar\\n✓ someTest";
    const result = parseAuditLogDetails(rawDump);
    
    expect(result.isRawDump).toBe(true);
    expect(result.report?.status).toBe('passed'); // Passed because tests were green
    expect(result.cleanDetails.message).toBe('[Parsed Structured Report]');
  });

  it('should not invent fake checks or recommendations if none are provided', () => {
    const rawDump = `
      stdout | src/foo.ts
      ✓ test1
      ✓ test2
    `;
    const result = parseAuditLogDetails(rawDump);
    
    expect(result.isRawDump).toBe(true);
    expect(result.report?.checksPerformed).toEqual([]);
    expect(result.report?.recommendations).toEqual([]);
  });
});

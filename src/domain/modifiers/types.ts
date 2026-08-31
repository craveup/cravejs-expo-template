import type { SelectedModifierTypes } from '@craveup/storefront-sdk';

export type ModifierSelectionPathEntry = {
  groupId: string;
  optionId?: string;
};

type ModifierIssueBase = {
  path: ModifierSelectionPathEntry[];
};

export type ModifierValidationIssue =
  | (ModifierIssueBase & {
      code: 'PRODUCT_UNAVAILABLE';
      productId: string;
      availability: string;
    })
  | (ModifierIssueBase & {
      code: 'INVALID_GROUP_RULE';
      groupId: string;
      minimum: number;
      maximum: number;
    })
  | (ModifierIssueBase & {
      code: 'UNKNOWN_GROUP';
      groupId: string;
    })
  | (ModifierIssueBase & {
      code: 'DUPLICATE_GROUP';
      groupId: string;
      source: 'catalog' | 'selection';
    })
  | (ModifierIssueBase & {
      code: 'DUPLICATE_ROOT_GROUP_REFERENCE';
      groupId: string;
    })
  | (ModifierIssueBase & {
      code: 'MISSING_ROOT_GROUP';
      groupId: string;
    })
  | (ModifierIssueBase & {
      code: 'UNEXPECTED_ROOT_GROUP';
      groupId: string;
    })
  | (ModifierIssueBase & {
      code: 'MIN_SELECTIONS_NOT_MET';
      groupId: string;
      minimum: number;
      actual: number;
    })
  | (ModifierIssueBase & {
      code: 'MAX_SELECTIONS_EXCEEDED';
      groupId: string;
      maximum: number;
      actual: number;
    })
  | (ModifierIssueBase & {
      code: 'UNKNOWN_OPTION';
      groupId: string;
      optionId: string;
    })
  | (ModifierIssueBase & {
      code: 'DUPLICATE_OPTION';
      groupId: string;
      optionId: string;
      source: 'catalog' | 'selection';
    })
  | (ModifierIssueBase & {
      code: 'INVALID_OPTION_QUANTITY';
      groupId: string;
      optionId: string;
      quantity: number;
    })
  | (ModifierIssueBase & {
      code: 'OPTION_UNAVAILABLE';
      groupId: string;
      optionId: string;
      maxQuantity: number;
      reason: 'invalid_limit' | 'non_positive_limit';
    })
  | (ModifierIssueBase & {
      code: 'OPTION_QUANTITY_EXCEEDED';
      groupId: string;
      optionId: string;
      quantity: number;
      maxQuantity: number;
    })
  | (ModifierIssueBase & {
      code: 'UNRESOLVED_CHILD_GROUP';
      groupId: string;
      optionId: string;
      childGroupId: string;
    })
  | (ModifierIssueBase & {
      code: 'CIRCULAR_MODIFIER_TREE';
      groupId: string;
    })
  | (ModifierIssueBase & {
      code: 'ORPHANED_CHILD_SELECTION';
      groupId: string;
      optionId: string;
      childGroupId: string;
    });

export type ModifierValidationResult =
  | {
      valid: true;
      selections: SelectedModifierTypes[];
    }
  | {
      valid: false;
      issues: ModifierValidationIssue[];
    };

export type ModifierPayloadResult =
  | {
      ok: true;
      payload: SelectedModifierTypes[];
    }
  | {
      ok: false;
      issues: ModifierValidationIssue[];
    };

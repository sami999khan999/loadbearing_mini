// **The first of this app's two outside surfaces**, and the client-safe one: a
// server-only package here is the leak. See docs/reference/import-surfaces.md.

// ── @loadbearing/api-client ──────────────────────────────────────────────────
// `AuthClient` is constructed per component, never a module singleton: the instance
// differs per environment.
export {
  AccountClient,
  ApiClient,
  type AppClientContext,
  AuthClient,
  CookieAuthStrategy,
  OrganizationClient,
} from "@loadbearing/api-client";

// ── @loadbearing/content ─────────────────────────────────────────────────────
// The client catalog, never `SERVER_CATALOG`: the `email` namespace is the worker's, and
// the ESLint ban fires on this line.
export {
  type ClientNamespace,
  ContentSource,
  type Locale,
  Locales,
  type MessageSnapshot,
  MessageStore,
  StaticContentSource,
} from "@loadbearing/content";
export type {
  DocNavNodeDto,
  DocPageDraftDto,
  DocPageId,
  DocReadingDto,
  DocSearchHitDto,
  DocSpaceDto,
  DocSpaceId,
  OrganizationId,
  UserId,
} from "@loadbearing/contracts";
// ── @loadbearing/contracts ───────────────────────────────────────────────────
// The two branded ids `session.fn.ts` casts to, and the one entity a route asks a
// question of. The shapes a component renders arrive through `@loadbearing/query`.
export { ConversationEntity, Identifiers } from "@loadbearing/contracts";

// ── @loadbearing/errors ──────────────────────────────────────────────────────
// `route/-loader-error.ts` only: a loader's `NOT_FOUND` becomes the router's not-found.
export { ErrorNormalizer } from "@loadbearing/errors";

// ── @loadbearing/feature ─────────────────────────────────────────────────────
export {
  AccountPanel,
  ActiveSessionList,
  ApiKeyList,
  AssistantQuestionForm,
  AssistantThreadList,
  AssistantThreadPanel,
  AssistantUsagePanel,
  ChangeEmailForm,
  ChangePasswordForm,
  ConversationCreateForm,
  ConversationList,
  CreateApiKeyForm,
  CreateOrganizationForm,
  CreateRoleForm,
  DeleteTenantPanel,
  DocEditorForm,
  DocGrantPanel,
  DocNavTree,
  DocOrphanedSpaceList,
  DocPageTreeList,
  DocReaderPanel,
  DocRevisionList,
  type DocSearchHit,
  DocSpaceForm,
  DocSpaceList,
  DocumentSearch,
  EffectivePermissionsInspector,
  FlagList,
  ForgotPasswordForm,
  IndexDocumentForm,
  InvitationAccept,
  InvitationList,
  InviteMemberForm,
  LinkedAccountList,
  MemberAccessPanel,
  MemberCount,
  MemberList,
  MessageComposer,
  MessageList,
  MessageProvider,
  ModuleNav,
  ModuleSwitchPanel,
  NotificationBell,
  NotificationList,
  NotificationPreferenceForm,
  OrganizationEntitlementPanel,
  OrganizationSwitcher,
  PlanList,
  PlatformNav,
  PlatformStatusPanel,
  PresenceNotice,
  ProfileForm,
  PushDeviceForm,
  ReplicaSwitchPanel,
  ResetPasswordForm,
  RoleList,
  RoleMatrix,
  SessionProvider,
  type SessionUser,
  SignInForm,
  SignOutButton,
  SignUpForm,
  SocialSignIn,
  TenantExportPanel,
  TwoFactorForm,
  TwoFactorPanel,
  TwoFactorSetup,
  TypingNotice,
  useCapabilities,
  useErrorMessage,
  useIsPlatformOrganization,
  useMessages,
  useSession,
  VerifyEmailNotice,
} from "@loadbearing/feature";

// ── @loadbearing/permissions ─────────────────────────────────────────────────
// The same `can()` the server calls, which is why the guard rebuilds the DTO rather than
// shape-checking the JSON.
export {
  CapabilitySet,
  type CapabilitySetDto,
  type FlagKey,
  FlagRegistry,
  type PermissionKey,
  PLATFORM_ROUTE_PERMISSION,
  ROUTES,
} from "@loadbearing/permissions";

// ── @loadbearing/query ───────────────────────────────────────────────────────
export {
  ApiClientProvider,
  ApiKeyQueries,
  AssistantQueries,
  createQueryClient,
  DocQueries,
  MemberQueries,
  MessagingQueries,
  NotificationQueries,
  OrganizationMutations,
  PlatformQueries,
  RealtimeProvider,
  RoleQueries,
  useApiClient,
  useAppQuery,
  useConversationStream,
} from "@loadbearing/query";

// ── @loadbearing/ui ──────────────────────────────────────────────────────────
export {
  AlertDialog,
  AppLayout,
  appLayoutClassName,
  type BadgeTone,
  Button,
  type ButtonVariant,
  buttonClassName,
  Callout,
  type CalloutTone,
  Can,
  Card,
  CardGrid,
  CodeList,
  cn,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  type FontKey,
  FontRegistry,
  Icon,
  Input,
  type LinkAttributes,
  Menu,
  type ModeKey,
  type ModePreference,
  ModeRegistry,
  PageScrollbar,
  Popover,
  Prose,
  QrCode,
  readerClassName,
  Select,
  Sidebar,
  StatusBadge,
  Textarea,
  type ThemeKey,
  ThemeRegistry,
  ThemeScope,
  ThemeToggle,
  Tooltip,
} from "@loadbearing/ui";

// ── @tanstack/react-query ────────────────────────────────────────────────────
export {
  type DehydratedState,
  dehydrate,
  hydrate,
  type QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";

// ── @tanstack/react-router ───────────────────────────────────────────────────
// `router.tsx` only. Everything under `route/` imports this package directly.
export { createRouter } from "@tanstack/react-router";

// ── react ────────────────────────────────────────────────────────────────────
export { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from "react";

// ── zod ──────────────────────────────────────────────────────────────────────
// Search-parameter schemas only: a route validates what a browser put in its own URL
// bar, and the wire shapes are `contracts`' business.
export { z } from "zod";

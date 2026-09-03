# Modern Mobile Design System Implementation Plan

> **For Cursor:** Use executing-plans skill to implement this plan task-by-task.

**Goal:** Transform the TeamTime Flutter mobile app to adopt the modern design system shown in the reference screenshot: white squircle badges, bold white hero typography, pill/stadium buttons (pure white primary, translucent glass secondary), rounded cards, and unified modern visual hierarchy across all screens.

**Architecture:** Introduce a unified design system module (`mobile/lib/widgets/design_system.dart`) defining standardized `TtButton`, `TtTextField`, `TtSquircleBadge`, and `TtGlassCard` components. Update `TeamTimeTheme` to apply pill buttons, rounded input fields, and translucent navigation bars. Refactor Auth screens, Shell navigation, Home, Chat, and utility screens to consume these components.

**Tech Stack:** Flutter (Material 3), Google Fonts (Poppins), Riverpod, GoRouter.

---

## Task 1: Create Core Design System Components

**Files:**
- [NEW] `mobile/lib/widgets/design_system.dart`
- [MODIFY] `mobile/lib/widgets/common.dart`
- [TEST] `mobile/test/design_system_test.dart`

**Step 1: Write failing widget test for design system components**
Create `mobile/test/design_system_test.dart` verifying `TtButton.primary`, `TtButton.secondary`, `TtSquircleBadge`, and `TtTextField` render as pill/stadium shapes with correct styling.

**Step 2: Run test to verify failure**
Run `flutter test test/design_system_test.dart` to verify missing classes fail to compile.

**Step 3: Implement `design_system.dart`**
- `TtButton`:
  - `TtButton.primary`: Height 54dp, `StadiumBorder`, `Colors.white` background, `#0F172A` text, soft drop shadow.
  - `TtButton.secondary` / `TtButton.glass`: Height 54dp, `StadiumBorder`, `Color(0x26FFFFFF)` fill, `Border.all(color: Color(0x4DFFFFFF))`, `Colors.white` text.
  - `TtButton.filled`: Height 54dp, `StadiumBorder`, `#0284C7` fill, white text.
- `TtSquircleBadge`:
  - White container with `BorderRadius.circular(22)`, soft shadow, housing an icon or child.
- `TtTextField`:
  - Rounded text field (radius 20) with white or translucent fill, clean padding, and high-contrast text.
- `TtGlassCard`:
  - Translucent card (`Color(0xD9FFFFFF)` or `Color(0x26FFFFFF)`) with `BorderRadius.circular(20)` and border.

**Step 4: Run test to verify pass**
Run `flutter test test/design_system_test.dart` and confirm tests pass.

---

## Task 2: Update Theme & Global Styles

**Files:**
- [MODIFY] `mobile/lib/app/theme.dart`

**Step 1: Update ThemeData in `theme.dart`**
- Configure `filledButtonTheme` with `StadiumBorder` and minimum height 52dp.
- Configure `inputDecorationTheme` with `borderRadius: BorderRadius.circular(20)`.
- Configure `navigationBarTheme` with translucent pill indicator and floating surface.
- Configure `cardTheme` with `borderRadius: BorderRadius.circular(20)`.

**Step 2: Run static analysis**
Run `flutter analyze` to ensure 0 lint or type issues.

---

## Task 3: Revamp Auth Screens with Reference Design

**Files:**
- [MODIFY] `mobile/lib/features/auth/auth_screens.dart`

**Step 1: Redesign `LoginScreen`**
- Add `TtSquircleBadge` at the top with TeamTime brand icon.
- Bold hero title: "TeamTime\nYour workspace, upgraded".
- Translucent subtitle: "Sign in to collaborate, chat, and meet with your team."
- Replace inputs with modern `TtTextField` / styled rounded fields.
- Primary pill white button `TtButton.primary(text: 'Sign in', onPressed: ...)` with dark text.
- Secondary pill glass button `TtButton.secondary(text: 'Forgot password', onPressed: ...)`.

**Step 2: Redesign `TwoFactorScreen`, `ForgotPasswordScreen`, `ResetPasswordScreen`**
- Apply the same visual hierarchy: squircle icon, bold white hero title, translucent subtitle, rounded fields, and pill buttons.

**Step 3: Run existing & new tests**
Run `flutter test` to ensure auth flows and tests pass.

---

## Task 4: Modernize Shell & Navigation

**Files:**
- [MODIFY] `mobile/lib/features/shell/shell_screen.dart`

**Step 1: Update `ShellScreen`**
- Apply glassmorphism / floating pill styling to `NavigationBar`.
- Style FloatingActionButton ("More") as a sleek pill button.
- Update `IncomingCallOverlay` with pill buttons (Accept green, Decline red).

**Step 2: Run static analysis**
Run `flutter analyze` to verify clean build.

---

## Task 5: Enhance Home & Feature Screens

**Files:**
- [MODIFY] `mobile/lib/features/home/home_screen.dart`
- [MODIFY] `mobile/lib/features/chat/chat_lists.dart`
- [MODIFY] `mobile/lib/features/chat/conversation_screen.dart`

**Step 1: Update `HomeScreen`**
- Stat chips with rounded squircle containers and vibrant blue values.
- Clean rounded conversation tiles with squircle avatars.

**Step 2: Update `chat_lists.dart` & `conversation_screen.dart`**
- Chat composer with pill input and rounded add button.
- Smooth message bubbles with rounded pill-like corners.

**Step 3: Run test suite**
Run `flutter test` and `flutter analyze`.

---

## Task 6: Update Documentation & Memory

**Files:**
- [MODIFY] `agentic/features/flutter-mobile-app/memory.md`
- [MODIFY] `agentic/features/flutter-mobile-app/design.md`

**Step 1: Update `memory.md` & `design.md`**
- Document design system update reflecting the reference UI (pill buttons, squircle badges, hero typography, glassmorphism).

---

## Verification Plan

### Automated Tests
```bash
flutter test
flutter analyze
```

### Hot Reload / Running App Verification
- Proactively verify running app with DTD / `hot_reload`.

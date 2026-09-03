# selene-zebar

GlazeWM 위에서 쓸 Zebar 상태바를 직접 만든다. 개인용이자 GitHub 포트폴리오.

## 이 프로젝트를 시작한 이유

현재 상태바는 **YASB**(Python/PyQt6)를 쓰고 있고 잘 동작한다. 그럼에도 옮기는 이유는
스타일링 레이어 때문이다. YASB 는 Qt 스타일시트(QSS)로 그려지는데, 이건 CSS2 의
부분집합이라 `transition`·`@keyframes`·flexbox·grid 가 **전부 없다**. 실제로 워크스페이스
알약이 늘어나는 애니메이션을 넣으려다 막혔고, 팝업 여백은 컨테이너 클래스가 없어
자식 요소마다 margin 을 발라 우회했다.

Zebar 는 Tauri 창 안에서 **WebView2(Chromium)** 가 렌더링한다. 즉 진짜 CSS 다.
목표 세 가지가 여기서 동시에 성립한다 — 개인용 상태바, 포트폴리오, CSS 학습.

트레이드오프도 알고 시작한다: Zebar 는 기성 위젯이 없고 데이터 프로바이더 15 개
(`glazewm`, `media`, `memory`, `cpu`, `battery`, `systray`, `weather`, `audio`, `date` 등)만
제공한다. UI 는 전부 직접 그린다. 프로바이더에 없는 값은 `shellExec` 로 우회한다.

## 환경

| | |
|---|---|
| Zebar | 3.3.1 (winget `glzr-io.zebar`), 설치 완료 |
| GlazeWM | 3.10.1 (winget `glzr-io.glazewm`) |
| Node / pnpm | v24.11.1 / 11.18.0 (npm 11.6.2, yarn 1.22.22 도 있음) |
| OS | Windows 11, 삼성 Galaxy Book, 단일 모니터 1920x1080 @ DPI 1.25 |

## 디렉터리 구조와 링크 전략

개발은 이 폴더에서 하고, Zebar 가 읽는 위치로 **심볼릭 링크**를 건다.

```
C:\dev\projects\selene-zebar      ← 개발 + git
        ↓ symlink
%USERPROFILE%\.glzr\zebar\selene-zebar   ← Zebar 가 로드
```

Zebar 는 `~/.glzr/zebar/` 아래에서 `zpack.json` 이 있는 디렉터리를 위젯팩으로 인식한다.
기동 설정은 `~/.glzr/zebar/settings.json` 이며 현재는 기본 팩을 가리킨다:

```json
{ "pack": "glzr-io.starter", "widget": "with-glazewm", "preset": "default" }
```

팩 식별자는 `<publisher>.<pack-name>` 소문자 형식(`glzr-io.starter`). 저장소명·폴더명·
`package.json` name·팩 ID 를 전부 `selene-zebar` 로 통일한다.

**심볼릭 링크 생성에는 관리자 권한이 필요하다** (개발자 모드 꺼져 있음). dotfiles 저장소의
`install.ps1` 에 있는 `New-Link` 함수가 같은 패턴을 이미 구현해 두었으니 재사용할 것.

## 디자인 방향

기존 YASB 바에서 이어갈 것 — 팔레트와 타이포는 이미 손에 익었다.

- **Catppuccin Mocha**. 강조색 mauve `#cba6f7`, 보조 lavender `#b4befe`, 배경 base `#1e1e2e`
- 본문 **Inter** (사용자 계정에 정적 웨이트 7종 설치됨), 아이콘 **JetBrainsMono NFP**
  (Nerd Font 글리프는 Inter 에 없으므로 아이콘 규칙에 폰트를 따로 지정해야 한다)
- 이름은 달의 여신 Selene 에서 왔다. 다크 + mauve 계열이라는 색 방향과 맞춘 것

## 함께 쓰는 GlazeWM 구성

이 바가 표시할 워크스페이스 배치다. 부팅 시 `startup-layout.ps1` 이 워크스페이스 순서대로
하나씩 띄운다(창이 실제로 잡힌 걸 확인하고 다음으로 넘어감).

| WS | 내용 |
|---|---|
| 1 | Chrome (Profile 1, 개인) |
| 2 | Claude Desktop + Notion |
| 3 | VS Code — `C:\dev\dotfiles` (창 제목 `ORCH` 접두어로 식별) |
| 4 | 그 외 모든 VS Code 창 |
| 5 | Windows Terminal(`--title Deploy`) + VS Code Remote SSH |
| 6 | Discord(좌) + 카카오톡(우 40%) |
| 7 | Chrome (Profile 3, 학교) + Gemini PWA(우 40%) |
| 8 | YouTube Music PWA |

## 관련 저장소

- **dotfiles** — `C:\dev\dotfiles` → `github.com/bmc00-05/dotfiles` (비공개)
  GlazeWM·YASB·Zebar 설정이 들어 있다. Zebar 위젯팩이 완성되면
  `zebar/settings.json` 의 `startupConfigs` 를 이 팩으로 바꿔야 한다.

## 작업 시 주의

- **OneDrive 는 쓰지 않는다.** 문제가 생겨도 OneDrive 를 켜는 방향으로 해결하지 말 것.
  경로가 필요하면 로컬 경로를 쓴다.
- 앱 자동 실행은 GlazeWM 이 소유한다. Windows 시작 프로그램에는 GlazeWM 만 있고
  나머지는 `startup-layout.ps1` 이 띄운다.
- 사용자와는 한국어로 대화한다.

# Rebuild OCR Thanh Live Detection Mot Nut

## Summary

- Thay co che auto-scan moi N giay bang **Live Detect**: nguoi dung bam F4 hoac nut camera mot lan de bat dau theo doi lien tuc.
- Khong OCR lien tuc. App mo mot `MediaStream` capture game/screen, doc frame nhanh bang canvas, chi tinh hash/pixel diff tren vai vung "dirty signal".
- Khi phat hien UI Trial doi, app doi frame on dinh ngan, OCR full state mot lan, validate. Neu nghi ngo thi tu quet lai toi da 3 frame; van nghi ngo thi giu de xuat cu va hien canh bao.
- HUD van **click duoc** de chinh so, quet, mo rong, dong app.

## Context And Target

Trang thai hien tai cua app la polling OCR theo interval: moi lan scan goi `desktopCapturer.getSources`, lay thumbnail, encode PNG/dataURL, renderer decode thanh `Image`, ve vao canvas roi OCR full state. Cach nay co ba van de:

- Do tre bi khoa boi interval. Neu interval la 2 giay thi nguoi choi co the doi gan 2 giay sau thao tac moi thay de xuat moi.
- Moi scan deu lam nhieu viec nang va thua: tim source, chup full thumbnail, encode/decode anh, OCR toan bo, ghi debug capture.
- Neu tang tan suat polling de nhanh hon thi CPU/IO tang, de gap frame animation, va HUD/overlay de lam trai nghiem game bi kho chiu.

Muc tieu san pham cua lan rebuild nay:

- Nguoi choi bam **mot nut** de bat live assistant, sau do cu thao tac trong game binh thuong.
- Sau moi hanh dong trong Trial of Swordmancy, app phai tu nhan ra UI da doi va dua ra de xuat nut tiep theo nhanh nhat co the.
- Muc tieu cam nhan: de xuat moi hien trong khoang `200-450ms` sau khi UI game da on dinh, khong phai cho den tick 2 giay.
- Uu tien dung va on dinh hon cap nhat lieu trong luc animation. Neu OCR nghi ngo, tu retry 3 lan; khong ghi de de xuat cu bang ket qua khong chac.
- HUD phai click duoc de nguoi dung chinh attempts/abandons/doubles hoac force scan, nhung app khong duoc bat nguoi dung thao tac phuc tap de duy tri live detect.

## Why This Approach

Chon **continuous capture + dirty-region detection + OCR-on-change** thay vi OCR polling lien tuc vi:

- Capture stream tranh viec lap lai `desktopCapturer.getSources` va PNG/dataURL encode/decode cho moi scan. Renderer co san frame moi, nen doc canvas nhanh hon va it side effect hon.
- Dirty-region detection re hon OCR rat nhieu. App chi so pixel/hash o vai vung nho de biet "man hinh co doi khong"; OCR chi chay khi can.
- Khong phan loai tung hanh dong `rut bai`, `bo bai`, `bat/tat x2`, `bat dau khao nghiem`. Tat ca hanh dong hop le deu lam doi it nhat mot vung state chung: bang diem/thuong, control band, deck panel, x2 switch hoac Trial anchor. Dung cac vung nay lam "chuong bao" giup code it nhanh logic va de debug hon state machine theo tung action.
- Retry 3 lan la can bang giua toc do va do chac. Frame dau sau thao tac co the dang animation; doc ngay de sai. Doi 120-160ms va retry toi da 3 lan van nhanh hon polling 2 giay, nhung giam nguy co dua de xuat sai.
- Giu template matching cho digit vi bai toan chi can doc digit nho/co dinh. Tesseract/ML OCR nang hon, cham hon va kho on dinh hon voi UI game nho.

Nhung dieu khong nen lam trong lan rebuild nay:

- Khong xay action-specific state machine phuc tap cho tung nut game. Neu can, chi suy luan action sau khi da co state moi, khong dung action detector lam trigger chinh.
- Khong OCR toan bo moi 100ms. Watch loop nhanh chi duoc lam viec re: crop/hash/diff.
- Khong commit ket qua OCR nghi ngo vao solver/UI. Neu retry het van nghi ngo, giu state cu va hien canh bao.
- Khong ghi `debug_capture.png` tren moi frame/live tick.

## Key Changes

### Capture Pipeline

- Main process them IPC `resolve-capture-source` de chon game window theo title/keyword, fallback primary screen.
- Preload expose `resolveCaptureSource()`.
- Renderer dung `navigator.mediaDevices.getUserMedia` voi `chromeMediaSourceId` de tao video stream lien tuc.
- Bo polling kieu `desktopCapturer.getSources` + PNG/dataURL moi lan scan cho live mode.
- Giu `requestScreenshot`/file picker lam fallback manual debug.

### Watch Loop

- F4/nut scan doi thanh toggle **Live Detect on/off**; F5 van force full OCR ngay.
- Watch interval mac dinh `120ms`; khi khong thay Trial UI thi giam con `400-500ms`.
- Khong doan hanh dong rieng le. Chi dung dirty regions de biet "UI da doi, can doc lai state".
- Them `watchRegions` trong `electron/config.js`, scale theo resolution:
  - `trialAnchor`: khoang top-center attempts/bracket, vi du 2K `{ x: 980, y: 80, width: 620, height: 80 }`.
  - `scoreRewardBand`: bang diem/thuong day man hinh, vi du `{ x: 80, y: 980, width: 1980, height: 170 }`.
  - `controlBand`: x2 + nut bat dau/bo/rut, vi du `{ x: 1050, y: 1210, width: 1380, height: 150 }`.
  - `deckPanel`: panel bai con lai ben phai, vi du `{ x: 2130, y: 170, width: 380, height: 560 }`.
  - `x2Switch` tiep tuc dung vung hien co.
- Signature moi region dung sampled block means/histogram, khong OCR. Dirty neu region diff vuot threshold hoac x2 state doi.

### OCR And State Reducer

- Tach `analyzeCanvas` thanh pipeline ro:
  - `scanFullState(ctx, width, height)` tra ve state object.
  - `validateScanState(state, previousState)` tra ve `accepted | retry | warning`.
  - `commitScanState(state)` moi update UI, solver, localStorage.
- State object gom: `inTrial`, `mode`, `slots`, `remainingDeck`, `attemptsLeft`, `freeAbandonsLeft`, `doublesLeft`, `isDoubled`, `confidence`, `warnings`, `timestamp`.
- OCR digit functions tra kem confidence/margin thay vi chi digit.
- Validation:
  - digit confidence/margin dat nguong.
  - hand toi da 5 la, digit 1-5.
  - deck counts trong range hop ly.
  - neu co preset/high-trust thi `hand + remainingDeck` phai khop deck xuat phat; neu khong, downgrade confidence.
  - frame dang animation hoac mismatch lon thi retry.
- Retry policy theo yeu cau: toi da 3 lan, cach nhau `120-160ms`; sau 3 lan van nghi ngo thi giu de xuat cu va hien "OCR chua chac, dang cho UI on dinh / bam F5".

### UX

- Auto-scan checkbox/interval cu doi thanh "Live Detect".
- Status badge hien thi: `LIVE`, `DANG DOC`, `DANG XAC MINH 2/3`, `OCR CHUA CHAC`.
- Khong ghi `debug_capture.png` moi frame; chi ghi khi bat debug/manual force de tranh IO thua.
- Overlay giu `focusable=true` de click duoc HUD.

## Test Plan

- Fix/replace OCR test runner de chay duoc Electron OCR offline tren `Screenshoot/1.png` den `6.png`.
- Test cases bat buoc:
  - Empty hand nhan dung deck/attempts/x2.
  - Draw 2 la, draw 5 la, free trial, anh `5.png`, `6.png`.
  - X2 bat/tat chi lam solver update, khong can OCR sai state.
  - Abandon/reset deck nhan ra state moi va khong cong thuong sai.
  - Start trial/battle lam app sleep OCR nang, quay lai Trial thi scan full mot lan.
  - Low-confidence frame gia lap phai retry 3 lan roi canh bao, khong ghi de de xuat cu.
- Manual acceptance:
  - Bam F4 mot lan, app bat dau live detect.
  - Sau moi thao tac game, de xuat moi xuat hien trong khoang `200-450ms` sau khi UI on dinh.
  - CPU thap hon polling OCR lien tuc; khong co ghi file lien tuc.
  - HUD click duoc de chinh so/scan/mo rong.

## Assumptions

- Game chay layout 16:9 giong screenshot hien tai; ROI 2K se auto-scale cho 1080p/4K.
- Uu tien dung va on dinh hon cap nhat lieu trong luc animation.
- Dirty trigger chinh la cac vung BP/reward/control/deck panel; khong xay state machine rieng cho tung hanh dong.
- Neu khong tim thay game window, live capture fallback sang primary screen.

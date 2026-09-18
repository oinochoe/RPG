boolean AUTO_EXPORT = false;

color BG_COLOR = color(24, 20, 26);
color PANEL_OUTER = color(62, 46, 32);
color PANEL_INNER = color(96, 72, 48);
color PANEL_ACCENT = color(210, 170, 105);
color PANEL_TEXT = color(248, 236, 214);

color SLOT_OUTER = color(54, 42, 36);
color SLOT_BASE = color(124, 108, 92);
color SLOT_HIGHLIGHT = color(255, 240, 220, 28);
color SLOT_INNER_BORDER = color(214, 184, 140);

color STATE_HOVER = color(232, 198, 124);
color STATE_SELECTED = color(156, 206, 255);
color STATE_LOCKED = color(150, 150, 158);
color STATE_RARE = color(120, 190, 255);
color STATE_EPIC = color(210, 155, 255);
color STATE_LEGENDARY = color(255, 215, 120);

void setup() {
  size(1180, 760);
  smooth(8);

  if (AUTO_EXPORT) {
    generateInventoryPack();
    println("EXPORT TERMINE");
    exit();
  }
}

void draw() {
  background(BG_COLOR);
  drawPreviewScene();
}

void drawPreviewScene() {
  float panelX = 40;
  float panelY = 40;
  float panelW = 1100;
  float panelH = 680;

  drawInventoryPanel(panelX, panelY, panelW, panelH);

  String[] labels = {
    "Normal", "Hover", "Selected", "Locked",
    "Rare", "Epic", "Legendary"
  };

  String[] states = {
    "normal", "hover", "selected", "locked",
    "rare", "epic", "legendary"
  };

  color[] glows = {
    SLOT_INNER_BORDER,
    STATE_HOVER,
    STATE_SELECTED,
    STATE_LOCKED,
    STATE_RARE,
    STATE_EPIC,
    STATE_LEGENDARY
  };

  float slotSize = 72;
  float groupTop = panelY + 72;
  float titleY = groupTop + 26;
  float slotY = groupTop + 58;

  float leftMargin = panelX + 36;
  float rightMargin = panelX + panelW - 36;
  float usableW = rightMargin - leftMargin;
  float colStep = usableW / labels.length;

  for (int i = 0; i < labels.length; i++) {
    float centerX = leftMargin + colStep * i + colStep / 2.0;
    float slotX = centerX - slotSize / 2.0;
    drawLabelCentered(labels[i], centerX, titleY);
    drawSlot(slotX, slotY, slotSize, states[i], glows[i]);
  }

  drawSectionTitle("Inventory Grid", panelX + 50, panelY + 255);
  drawInventoryGrid(panelX + 50, panelY + 285, 6, 4, 72, 18);

  float equipX = panelX + 780;
  float equipY = panelY + 300;

  drawSectionTitle("Equipment Layout", equipX + 48, panelY + 255);
  drawEquipmentLayout(equipX, equipY);
}

void generateInventoryPack() {
  exportSlot("slot_normal", "normal", SLOT_INNER_BORDER);
  exportSlot("slot_hover", "hover", STATE_HOVER);
  exportSlot("slot_selected", "selected", STATE_SELECTED);
  exportSlot("slot_locked", "locked", STATE_LOCKED);
  exportSlot("slot_rare", "rare", STATE_RARE);
  exportSlot("slot_epic", "epic", STATE_EPIC);
  exportSlot("slot_legendary", "legendary", STATE_LEGENDARY);

  exportGrid("inventory_grid_6x4", 6, 4);
  exportEquipment("equipment_layout");
  exportPanel("inventory_panel");
  exportPreview("inventory_preview");
}

void exportSlot(String fileName, String state, color glow) {
  PGraphics pg = createGraphics(128, 128);
  pg.beginDraw();
  pg.smooth(8);
  pg.clear();
  drawSlot(pg, 28, 28, 72, state, glow);
  pg.endDraw();
  pg.save(fileName + ".png");
}

void exportGrid(String name, int cols, int rows) {
  float size = 72;
  float gap = 18;

  int w = int(cols * size + (cols - 1) * gap);
  int h = int(rows * size + (rows - 1) * gap);

  PGraphics pg = createGraphics(w + 40, h + 40);
  pg.beginDraw();
  pg.smooth(8);
  pg.clear();
  drawInventoryGrid(pg, 20, 20, cols, rows, size, gap);
  pg.endDraw();
  pg.save(name + ".png");
}

void exportEquipment(String name) {
  PGraphics pg = createGraphics(350, 400);
  pg.beginDraw();
  pg.smooth(8);
  pg.clear();
  drawEquipmentLayout(pg, 60, 40);
  pg.endDraw();
  pg.save(name + ".png");
}

void exportPanel(String name) {
  PGraphics pg = createGraphics(800, 500);
  pg.beginDraw();
  pg.smooth(8);
  pg.clear();
  drawInventoryPanel(pg, 20, 20, 760, 460);
  pg.endDraw();
  pg.save(name + ".png");
}

void exportPreview(String fileName) {
  PGraphics pg = createGraphics(1400, 860);
  pg.beginDraw();
  pg.smooth(8);
  pg.background(BG_COLOR);

  float panelX = 40;
  float panelY = 40;
  float panelW = 1320;
  float panelH = 780;

  drawInventoryPanel(pg, panelX, panelY, panelW, panelH);

  String[] labels = {
    "Normal", "Hover", "Selected", "Locked",
    "Rare", "Epic", "Legendary"
  };

  String[] states = {
    "normal", "hover", "selected", "locked",
    "rare", "epic", "legendary"
  };

  color[] glows = {
    SLOT_INNER_BORDER,
    STATE_HOVER,
    STATE_SELECTED,
    STATE_LOCKED,
    STATE_RARE,
    STATE_EPIC,
    STATE_LEGENDARY
  };

  float slotSize = 86;
  float groupTop = panelY + 76;
  float titleY = groupTop + 28;
  float slotY = groupTop + 64;

  float leftMargin = panelX + 40;
  float rightMargin = panelX + panelW - 40;
  float usableW = rightMargin - leftMargin;
  float colStep = usableW / labels.length;

  for (int i = 0; i < labels.length; i++) {
    float centerX = leftMargin + colStep * i + colStep / 2.0;
    float slotX = centerX - slotSize / 2.0;
    drawLabelCentered(pg, labels[i], centerX, titleY);
    drawSlot(pg, slotX, slotY, slotSize, states[i], glows[i]);
  }

  drawSectionTitle(pg, "Inventory Grid", panelX + 70, panelY + 305);
  drawInventoryGrid(pg, panelX + 70, panelY + 340, 6, 4, 72, 18);

  float equipX = panelX + 930;
  float equipY = panelY + 350;

  drawSectionTitle(pg, "Equipment Layout", equipX + 48, panelY + 305);
  drawEquipmentLayout(pg, equipX, equipY);

  pg.endDraw();
  pg.save(fileName + ".png");
}

void drawLabelCentered(String txt, float x, float y) {
  textAlign(CENTER, CENTER);
  textSize(18);
  fill(0, 130);
  text(txt, x + 2, y + 2);
  fill(PANEL_TEXT);
  text(txt, x, y);
}

void drawLabelCentered(PGraphics pg, String txt, float x, float y) {
  pg.textAlign(CENTER, CENTER);
  pg.textSize(18);
  pg.fill(0, 130);
  pg.text(txt, x + 2, y + 2);
  pg.fill(PANEL_TEXT);
  pg.text(txt, x, y);
}

void drawSectionTitle(String txt, float x, float y) {
  textAlign(LEFT, CENTER);
  textSize(21);
  fill(0, 130);
  text(txt, x + 2, y + 2);
  fill(PANEL_TEXT);
  text(txt, x, y);
}

void drawSectionTitle(PGraphics pg, String txt, float x, float y) {
  pg.textAlign(LEFT, CENTER);
  pg.textSize(21);
  pg.fill(0, 130);
  pg.text(txt, x + 2, y + 2);
  pg.fill(PANEL_TEXT);
  pg.text(txt, x, y);
}

void drawInventoryPanel(float x, float y, float w, float h) {
  drawInventoryPanel(g, x, y, w, h);
}

void drawInventoryPanel(PGraphics pg, float x, float y, float w, float h) {
  pg.noStroke();
  pg.fill(0, 85);
  pg.rect(x + 8, y + 10, w, h, 24);

  pg.fill(PANEL_OUTER);
  pg.rect(x, y, w, h, 24);

  pg.fill(PANEL_INNER);
  pg.rect(x + 8, y + 8, w - 16, h - 16, 20);

  pg.noFill();
  pg.stroke(PANEL_ACCENT, 120);
  pg.strokeWeight(3);
  pg.rect(x + 18, y + 18, w - 36, h - 36, 14);

  pg.fill(PANEL_TEXT);
  pg.textSize(24);
  pg.textAlign(LEFT, CENTER);
  pg.text("Inventory", x + 46, y + 49);
}

void drawSlot(float x, float y, float s, String state, color glow) {
  drawSlot(g, x, y, s, state, glow);
}

void drawSlot(PGraphics pg, float x, float y, float s, String state, color glow) {
  pg.noStroke();
  pg.fill(0, 90);
  pg.rect(x + 4, y + 5, s, s, 14);

  pg.fill(SLOT_OUTER);
  pg.rect(x, y, s, s, 14);

  pg.fill(SLOT_BASE);
  pg.rect(x + 4, y + 4, s - 8, s - 8, 12);

  pg.fill(SLOT_HIGHLIGHT);
  pg.rect(x + 8, y + 8, s - 16, (s - 20) * 0.42, 10);

  pg.noFill();
  pg.stroke(glow, 135);
  pg.strokeWeight(2.5);
  pg.rect(x + 8, y + 8, s - 16, s - 16, 10);

  if (state.equals("hover")) {
    drawGlow(pg, x, y, s, glow);
  } else if (state.equals("selected")) {
    drawGlow(pg, x, y, s, glow);
    drawCorners(pg, x, y, s, glow);
  } else if (state.equals("locked")) {
    pg.fill(24, 24, 30, 86);
    pg.noStroke();
    pg.rect(x + 6, y + 6, s - 12, s - 12, 10);
    drawLock(pg, x + s / 2.0, y + s / 2.0, s * 0.22);
  } else if (state.equals("rare")) {
    drawGlow(pg, x, y, s, glow);
    drawDiamond(pg, x + s - 14, y + 14, 4, glow);
  } else if (state.equals("epic")) {
    drawGlow(pg, x, y, s, glow);
    drawDiamond(pg, x + s - 14, y + 14, 4, glow);
    drawDiamond(pg, x + 14, y + s - 14, 4, glow);
  } else if (state.equals("legendary")) {
    drawGlow(pg, x, y, s, glow);
    drawCorners(pg, x, y, s, glow);
    drawDiamond(pg, x + s - 14, y + 14, 4, glow);
    drawDiamond(pg, x + 14, y + s - 14, 4, glow);
  }
}

void drawInventoryGrid(float x, float y, int cols, int rows, float size, float gap) {
  drawInventoryGrid(g, x, y, cols, rows, size, gap);
}

void drawInventoryGrid(PGraphics pg, float x, float y, int cols, int rows, float size, float gap) {
  for (int r = 0; r < rows; r++) {
    for (int c = 0; c < cols; c++) {
      float px = x + c * (size + gap);
      float py = y + r * (size + gap);
      drawSlot(pg, px, py, size, "normal", SLOT_INNER_BORDER);
    }
  }

  drawSlot(pg, x + 1 * (size + gap), y + 0 * (size + gap), size, "rare", STATE_RARE);
  drawSlot(pg, x + 3 * (size + gap), y + 1 * (size + gap), size, "epic", STATE_EPIC);
  drawSlot(pg, x + 0 * (size + gap), y + 2 * (size + gap), size, "locked", STATE_LOCKED);
  drawSlot(pg, x + 5 * (size + gap), y + 2 * (size + gap), size, "legendary", STATE_LEGENDARY);
}

void drawEquipmentLayout(float x, float y) {
  drawEquipmentLayout(g, x, y);
}

void drawEquipmentLayout(PGraphics pg, float x, float y) {
  float s = 72;
  float gap = 18;

  float c0 = x;
  float c1 = x + s + gap;
  float c2 = x + 2 * (s + gap);

  float r0 = y;
  float r1 = y + s + gap;
  float r2 = y + 2 * (s + gap);
  float r3 = y + 3 * (s + gap);

  drawSlot(pg, c1, r0, s, "normal", SLOT_INNER_BORDER);
  drawSlot(pg, c0, r1, s, "rare", STATE_RARE);
  drawSlot(pg, c1, r1, s, "selected", STATE_SELECTED);
  drawSlot(pg, c2, r1, s, "epic", STATE_EPIC);
  drawSlot(pg, c1, r2, s, "normal", SLOT_INNER_BORDER);
  drawSlot(pg, c0, r3, s, "legendary", STATE_LEGENDARY);
  drawSlot(pg, c2, r3, s, "locked", STATE_LOCKED);
}

void drawGlow(PGraphics pg, float x, float y, float s, color c) {
  pg.noFill();
  pg.stroke(c, 120);
  pg.strokeWeight(3);
  pg.rect(x - 2, y - 2, s + 4, s + 4, 16);
}

void drawCorners(PGraphics pg, float x, float y, float s, color c) {
  pg.stroke(c);
  pg.strokeWeight(3);

  pg.line(x + 8, y + 8, x + 18, y + 8);
  pg.line(x + 8, y + 8, x + 8, y + 18);

  pg.line(x + s - 8, y + 8, x + s - 18, y + 8);
  pg.line(x + s - 8, y + 8, x + s - 8, y + 18);

  pg.line(x + 8, y + s - 8, x + 18, y + s - 8);
  pg.line(x + 8, y + s - 8, x + 8, y + s - 18);

  pg.line(x + s - 8, y + s - 8, x + s - 18, y + s - 8);
  pg.line(x + s - 8, y + s - 8, x + s - 8, y + s - 18);
}

void drawDiamond(PGraphics pg, float x, float y, float s, color c) {
  pg.noStroke();
  pg.fill(c);
  pg.beginShape();
  pg.vertex(x, y - s);
  pg.vertex(x + s, y);
  pg.vertex(x, y + s);
  pg.vertex(x - s, y);
  pg.endShape(CLOSE);
}

void drawLock(PGraphics pg, float cx, float cy, float s) {
  pg.rectMode(CENTER);

  pg.noFill();
  pg.stroke(225, 225, 232);
  pg.strokeWeight(2.5);
  pg.arc(cx, cy - s * 0.2, s * 1.4, s * 1.4, PI, TWO_PI);

  pg.noStroke();
  pg.fill(215, 215, 224);
  pg.rect(cx, cy + s * 0.25, s * 1.4, s * 1.1, 4);

  pg.fill(96, 96, 106);
  pg.ellipse(cx, cy + s * 0.15, s * 0.22, s * 0.22);
  pg.rect(cx, cy + s * 0.38, s * 0.16, s * 0.32, 2);

  pg.rectMode(CORNER);
}

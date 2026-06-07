-- 8BitSVG Exporter — exports the active Aseprite sprite as an optimized SVG and/or
-- a typed React component, using the exact greedy-mesh algorithm from the 8BitSVG
-- web app. The algorithm lives in src/lib/svg.ts and is transpiled to the bundled
-- 8bitsvg.generated.lua by TypeScriptToLua at build time (DRY: one source of truth).
--
-- Pure Lua — no external binary, so it works identically on Windows/macOS/Linux
-- and triggers no command-execution security prompt. Registered as a File ▸ Scripts
-- command via the plugin API (init/newCommand).

local svg -- the generated algorithm module; loaded from plugin.path in init().

-- Export the active sprite. Bound to the menu command's onclick.
local function doExport()
  local sprite = app.activeSprite
  if not sprite then
    app.alert("No active sprite to export.")
    return
  end

  -- Flatten the active frame's visible layers into one RGBA image (drawImage
  -- converts indexed/grayscale cels to RGBA using the sprite's palette).
  local frame = app.activeFrame or sprite.frames[1]
  local w, h = sprite.width, sprite.height
  local image = Image(w, h, ColorMode.RGB)
  image:clear()
  for _, layer in ipairs(sprite.layers) do
    if layer.isVisible and not layer.isGroup then
      local cel = layer:cel(frame)
      if cel then image:drawImage(cel.image, cel.position) end
    end
  end

  -- Build the flat cell list ("" = transparent), row-major to match the web model.
  local cells = {}
  for y = 0, h - 1 do
    for x = 0, w - 1 do
      local px = image:getPixel(x, y)
      local a = app.pixelColor.rgbaA(px)
      if a < 10 then
        cells[#cells + 1] = ""
      elseif a < 255 then
        cells[#cells + 1] = string.format(
          "#%02x%02x%02x%02x",
          app.pixelColor.rgbaR(px), app.pixelColor.rgbaG(px), app.pixelColor.rgbaB(px), a
        )
      else
        cells[#cells + 1] = string.format(
          "#%02x%02x%02x",
          app.pixelColor.rgbaR(px), app.pixelColor.rgbaG(px), app.pixelColor.rgbaB(px)
        )
      end
    end
  end

  -- Default save location: next to the sprite file, or a bare name if unsaved.
  local defaultBase = "PixelArt"
  if sprite.filename and sprite.filename ~= "" then
    defaultBase = app.fs.filePathAndTitle(sprite.filename)
  end

  local dlg = Dialog("Export as SVG + React")

  local function writeFile(path, content)
    local f = io.open(path, "w")
    if not f then return false end
    f:write(content)
    f:close()
    return true
  end

  -- Generate the chosen format's text from the current dialog selection.
  -- Returns (content, extension).
  local function build()
    local name = dlg.data.name
    if name == "" then name = "PixelArt" end
    if dlg.data.format == "React" then
      return svg.reactFromFlat(w, h, cells, name), "tsx"
    end
    return svg.svgFromFlat(w, h, cells), "svg"
  end

  dlg:entry { id = "name", label = "Component name:", text = "PixelArt" }
  dlg:combobox {
    id = "format",
    label = "Format:",
    option = "SVG",
    options = { "SVG", "React" },
    -- Keep the save dialog's default extension in sync with the chosen format
    -- (the written file's extension is enforced at save time regardless, but
    -- showing the right one here avoids confusion).
    onchange = function()
      local ext = dlg.data.format == "React" and "tsx" or "svg"
      dlg:modify { id = "path", filename = defaultBase .. "." .. ext }
    end,
  }
  dlg:file {
    id = "path",
    label = "Save as:",
    save = true,
    filename = defaultBase .. ".svg",
    filetypes = { "svg", "tsx" },
  }
  dlg:button {
    id = "save",
    text = "Save to file",
    focus = true,
    onclick = function()
      local content, ext = build()
      local chosen = dlg.data.path
      if not chosen or chosen == "" then
        app.alert("No output path was chosen.")
        return
      end
      local out = app.fs.filePathAndTitle(chosen) .. "." .. ext
      if writeFile(out, content) then
        app.alert("Exported:\n" .. out)
      else
        app.alert("Export failed: could not write " .. out)
      end
    end,
  }
  dlg:button {
    id = "copy",
    text = "Copy to clipboard",
    onclick = function()
      app.clipboard.text = (build())
      app.alert("Copied the " .. dlg.data.format .. " text to the clipboard.")
    end,
  }
  dlg:button { id = "cancel", text = "Cancel" }
  dlg:show()
end

-- Aseprite plugin entry points.
function init(plugin)
  -- Load the generated algorithm module bundled alongside this script.
  svg = dofile(app.fs.joinPath(plugin.path, "8bitsvg.generated.lua"))
  plugin:newCommand {
    id = "8bitsvg_export",
    title = "Export as SVG + React…",
    group = "file_scripts",
    onclick = doExport,
  }
end

function exit(plugin)
  -- nothing to clean up
end

Familiar Dock
Copyright (C) 2026 Ruben Gomez

This program is free software: you can redistribute it and/or modify it
under the terms of the GNU General Public License as published by the Free
Software Foundation, either version 2 of the License, or (at your option)
any later version. It is distributed WITHOUT ANY WARRANTY; see LICENSE.

Familiar Dock began as a port of GNOME's Dash to Panel extension
(https://github.com/home-sweet-gnome/dash-to-panel) and keeps its setting
names. It follows Dash to Panel behavior at upstream commit
c3aed934f927852a9ec28103e788d1954034bf4c (home-sweet-gnome/dash-to-panel).
Settings defaults derive from its GSettings schema. The layout grouping,
allocation, running-indicator geometry, click/cycle/minimize behavior and
Show Desktop state machine are JavaScript/QML ports of src/panel.js,
src/panelPositions.js and src/appIcons.js.

Dash to Panel is Copyright (C) its upstream contributors, licensed under
GPL-2.0-or-later. See LICENSE. This plugin is distributed under the same license.

Window matching, application-library usage and command dispatch follow the
installed Omarchy dock. Terminal window claims follow its DockModel.js
convention; web app URL matching follows the installed Spaces plugin's
host/path convention. No Spaces source files are bundled.

panel/AppGrid.qml is adapted from Omarchy's shell/plugins/dock/AppGrid.qml.
Changes route launches through this plugin's WindowActions/shell.appLibrary,
use this plugin's favorites and translation catalog, enforce bounded plain
text, use menu theme roles and the configured surface radius, and remove
stock-dock drag/uninstall behavior.
The original grid's layout, search, navigation, caching and overlay structure
are retained. Omarchy is MIT licensed; its notice is reproduced below.
Source: https://github.com/basecamp/omarchy
License: https://github.com/basecamp/omarchy/blob/master/LICENSE

Copyright (c) David Heinemeier Hansson

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:
The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The settings window (settings/SettingsWindow.qml, settings/Nav.js and the
row kit in settings/ui/) is adapted from OmaControl's SettingsWindow.qml and
ui/ (NavRow, SettingGroup, ToggleTile, ActionRow, Chip, KeyCap, Palette).
Retained: the header/sidebar/page/key-legend layout, the palette steps, the
single keyboard cursor with its key vocabulary and legend, and the search
that filters pages and rows. Changes: this plugin's settings model, strings
and writer; a panel-shaped hole in the overlay instead of a full scrim; QML
written for this plugin rather than copied, with bounded plain text.
OmaControl is MIT licensed; its notice is reproduced below.
Source: https://github.com/twiking/omacontrol

MIT License

Copyright (c) 2026 Tobias Wiking

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

pragma Singleton
import QtQuick
QtObject {
    property string formatLocale: "en_US"
    property bool rightToLeft: false
    function t(key) { return key }
    function formatNumber(n, digits) { return Number(n).toLocaleString(Qt.locale(formatLocale),'f',digits || 0) }
}

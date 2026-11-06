#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQuickImageProvider>
#include <QTimer>
#include <QDebug>

class IconProvider : public QQuickImageProvider {
public:
    IconProvider() : QQuickImageProvider(Image) {}
    QImage requestImage(const QString &, QSize *size, const QSize &) override {
        QImage image(32, 16, QImage::Format_RGBA8888);
        image.fill(Qt::red);
        *size = image.size();
        return image;
    }
};
int main(int argc, char **argv) {
    QGuiApplication app(argc, argv);
    QQmlApplicationEngine engine;
    engine.addImageProvider("icon", new IconProvider);
    QObject::connect(&engine, &QQmlApplicationEngine::quit, &app, [&]() {
        const bool passed = !engine.rootObjects().isEmpty() && engine.rootObjects()[0]->property("passed").toBool();
        qInfo() << (passed ? "Icon sampler provider readback passed" : "Icon sampler failed");
        app.exit(passed ? 0 : 1);
    });
    engine.load(QUrl::fromLocalFile(QString::fromLocal8Bit(argv[1])));
    if (engine.rootObjects().isEmpty()) return 1;
    QTimer::singleShot(5000, &app, [&]() { qWarning() << "Sampling timeout"; app.exit(2); });
    return app.exec();
}

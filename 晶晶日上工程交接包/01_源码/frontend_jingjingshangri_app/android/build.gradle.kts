allprojects {
    repositories {
        maven { url = uri("https://maven.aliyun.com/repository/google") }
        maven { url = uri("https://maven.aliyun.com/repository/central") }
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}

subprojects {
    afterEvaluate {
        // AGP 9 新 DSL：android 扩展实现 CommonExtension
        val androidExtension = project.extensions.findByName("android")
        if (androidExtension is com.android.build.api.dsl.CommonExtension) {
            androidExtension.compileSdk = 36
        }
        // tobias 5.3.4 自带 consumer-proguard 含 -dontshrink/-dontoptimize 等【全局选项】，
        // 新版 AGP 禁止其出现在 consumer 配置文件（exportReleaseConsumerProguardFiles 会失败）。
        // 本工程 release 未开启 minify/shrink，无需这些规则，清空 tobias 的 consumerProguardFiles。
        if (project.name == "tobias" &&
            androidExtension is com.android.build.api.dsl.LibraryExtension) {
            androidExtension.defaultConfig.consumerProguardFiles.clear()
        }
    }
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}

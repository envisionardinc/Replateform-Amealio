// Ensures decorator metadata is available for class-validator/class-transformer
// and NestJS DI in all test suites (esbuild/tsx would not emit this; ts-jest does).
import 'reflect-metadata';

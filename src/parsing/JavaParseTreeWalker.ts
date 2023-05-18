/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/* eslint-disable max-classes-per-file */

import {
    BaseSymbol, BlockSymbol, FieldSymbol, MethodSymbol, ParameterSymbol, ScopedSymbol, SymbolTable, InterfaceSymbol,
    Modifier, Type, TypeKind, ReferenceKind, VariableSymbol, ClassSymbol,
} from "antlr4-c3";
import { java } from "jree";

import { ParserRuleContext } from "antlr4ts";
import { TerminalNode } from "antlr4ts/tree/index.js";
import {
    AnnotationTypeBodyContext, MethodDeclarationContext, BlockContext, EnumDeclarationContext,
    InterfaceDeclarationContext, AnnotationTypeDeclarationContext, ClassDeclarationContext, ExpressionContext,
    FormalParameterContext, ConstantDeclaratorContext, PackageDeclarationContext, ImportDeclarationContext,
    ConstructorDeclarationContext, ClassBodyDeclarationContext, TypeDeclarationContext, InterfaceBodyDeclarationContext,
    InterfaceMethodDeclarationContext, JavaParser, LocalVariableDeclarationContext, FieldDeclarationContext,
    EnhancedForControlContext, CatchClauseContext, EnumConstantContext, InterfaceCommonBodyDeclarationContext,
    ClassCreatorRestContext,
    SwitchBlockStatementGroupContext,
} from "../../parser/generated/JavaParser.js";
import { JavaParserListener } from "../../parser/generated/JavaParserListener.js";

import { PackageSource } from "../PackageSource.js";
import { PackageSourceManager } from "../PackageSourceManager.js";

import { JavaClassSymbol } from "./JavaClassSymbol.js";

export class FileSymbol extends ScopedSymbol { }
export class AnnotationSymbol extends ScopedSymbol { }
export class EnumSymbol extends JavaClassSymbol { }
export class EnumConstantSymbol extends BaseSymbol { }
export class SwitchBlockGroup extends ScopedSymbol { }
export class ConstructorSymbol extends MethodSymbol { }

export class ClassBodySymbol extends ScopedSymbol { }

/** A symbol for class creators in initialisers. */
export class ClassCreatorSymbol extends ScopedSymbol { }

export class JavaInterfaceSymbol extends InterfaceSymbol {
    public isTypescriptCompatible = false;
    public typeParameters?: string;
}
export class InterfaceBodySymbol extends ScopedSymbol { }

export class InitializerBlockSymbol extends ScopedSymbol {
    public isStatic = false;
}

export class TypeSymbol extends BaseSymbol { }
export class PackageSymbol extends BaseSymbol { }
export class ImportSymbol extends BaseSymbol { }

export class JavaParseTreeWalker implements JavaParserListener {

    private static typeKindMap = new Map<string, TypeKind>([
        ["Array", TypeKind.Array],

        ["int", TypeKind.Integer],
        ["Integer", TypeKind.Integer],

        ["float", TypeKind.Float],

        ["String", TypeKind.String],

        ["boolean", TypeKind.Boolean],
        ["Boolean", TypeKind.Boolean],

        ["Map", TypeKind.Map],
    ]);

    private symbolStack = new java.util.Stack<ScopedSymbol>();
    private enumSymbol?: JavaClassSymbol;

    public constructor(private symbolTable: SymbolTable, private packageRoot: string,
        private importList: Set<PackageSource>) {
        this.symbolStack.push(symbolTable);

        // Get the Enum class symbol from the import list, in case we need it to add it to enum symbols.
        // Java implicitly derives enums from the `Enum` class, which we have to emulate here.
        for (const entry of importList) {
            const symbol = entry.symbolTable.symbolFromPath("java.lang.Enum") as ClassSymbol;
            if (symbol) {
                this.enumSymbol = symbol;

                break;
            }
        }
    }

    public exitPackageDeclaration = (ctx: PackageDeclarationContext): void => {
        const packageId = ctx.qualifiedName().text;
        this.symbolTable.addNewSymbolOfType(PackageSymbol, this.symbolStack.peek(), ctx.qualifiedName().text);

        const sources = PackageSourceManager.fromPackageIdWildcard(packageId);
        sources.forEach((source) => {
            this.importList.add(source);
        });

    };

    public exitImportDeclaration = (ctx: ImportDeclarationContext): void => {
        const packageId = ctx.qualifiedName().text;
        this.symbolTable.addNewSymbolOfType(ImportSymbol, this.symbolStack.peek(), packageId);

        if (ctx.MUL()) {
            const sources = PackageSourceManager.fromPackageIdWildcard(packageId);
            sources.forEach((source) => {
                this.importList.add(source);
            });
        } else {
            const source = PackageSourceManager.fromPackageId(packageId);
            this.importList.add(source);
        }

    };

    public enterBlock = (ctx: BlockContext): void => {
        this.pushNewScope(BlockSymbol, "#block#", ctx);
    };

    public exitBlock = (): void => {
        this.symbolStack.pop();
    };

    public enterClassDeclaration = (ctx: ClassDeclarationContext): void => {
        const symbol = this.pushNewScope(JavaClassSymbol, ctx.identifier().text, ctx);
        if (ctx.typeParameters()) {
            symbol.typeParameters = ctx.typeParameters()!.text;
        }
        this.checkStatic(symbol);
    };

    public exitClassDeclaration = (): void => {
        this.symbolStack.pop();
    };

    public enterClassBodyDeclaration = (ctx: ClassBodyDeclarationContext): void => {
        if (ctx.block()) {
            const symbol = this.pushNewScope(InitializerBlockSymbol, "#initializer#", ctx);
            symbol.isStatic = ctx.STATIC() !== undefined;
        }
    };

    public exitClassBodyDeclaration = (): void => {
        if (this.symbolStack.peek().name === "#initializer#") {
            this.symbolStack.pop();
        }
    };

    public enterClassCreatorRest = (ctx: ClassCreatorRestContext): void => {
        if (ctx.classBody()) { // Anonymous class.
            this.pushNewScope(ClassCreatorSymbol, "#anonymous-class#", ctx);
        }
    };

    public exitClassCreatorRest = (): void => {
        if (this.symbolStack.peek().name === "#anonymous-class#") {
            this.symbolStack.pop();
        }
    };

    public enterAnnotationTypeBody = (ctx: AnnotationTypeBodyContext): void => {
        this.pushNewScope(AnnotationSymbol, "#annotationTypeBody#", ctx);
    };

    public exitAnnotationTypeBody = (): void => {
        this.symbolStack.pop();
    };

    public enterMethodDeclaration = (ctx: MethodDeclarationContext): void => {
        const symbol = this.pushNewScope(MethodSymbol, ctx.identifier().text, ctx);
        this.checkStatic(symbol);
    };

    public exitMethodDeclaration = (): void => {
        this.symbolStack.pop();
    };

    public enterInterfaceMethodDeclaration = (ctx: InterfaceMethodDeclarationContext): void => {
        const symbol = this.pushNewScope(MethodSymbol, ctx.interfaceCommonBodyDeclaration().identifier().text, ctx);
        symbol.modifiers.add(Modifier.Static);
    };

    public exitInterfaceMethodDeclaration = (): void => {
        this.symbolStack.pop();
    };

    public enterConstructorDeclaration = (ctx: ConstructorDeclarationContext): void => {
        const symbol = this.pushNewScope(ConstructorSymbol, ctx.identifier().text, ctx);
        this.checkStatic(symbol);
    };

    public exitConstructorDeclaration = (): void => {
        this.symbolStack.pop();
    };

    public enterInterfaceDeclaration = (ctx: InterfaceDeclarationContext): void => {
        const symbol = this.pushNewScope(JavaInterfaceSymbol, ctx.identifier().text, ctx);
        if (ctx.typeParameters()) {
            symbol.typeParameters = ctx.typeParameters()!.text;
        }

        // Check the interface if it is compatible with Typescript.
        symbol.isTypescriptCompatible = true;
        ctx.interfaceBody().interfaceBodyDeclaration().forEach((context) => {
            // Entries without any content can be ignored.
            if (!context.SEMI() && symbol.isTypescriptCompatible) {
                const memberContext = context.interfaceMemberDeclaration();

                // The Java interface is compatible with TS if there are only:
                // - const declarations (will be moved to a side namespace)
                // - static (generic) method declarations (will be moved to a side namespace)
                // - non-static (generic) method declarations without a body.
                if (!memberContext?.constDeclaration()) {
                    let commonBodyDeclaration: InterfaceCommonBodyDeclarationContext | undefined;
                    if (memberContext?.interfaceMethodDeclaration()) {
                        commonBodyDeclaration = memberContext.interfaceMethodDeclaration()!
                            .interfaceCommonBodyDeclaration();
                    } else if (memberContext?.genericInterfaceMethodDeclaration()) {
                        commonBodyDeclaration = memberContext.genericInterfaceMethodDeclaration()!
                            .interfaceCommonBodyDeclaration();
                    }

                    if (!commonBodyDeclaration || commonBodyDeclaration.methodBody().block() != null) {
                        symbol.isTypescriptCompatible = false;
                    }
                }
            }
        });

    };

    public exitInterfaceDeclaration = (): void => {
        this.symbolStack.pop();
    };

    public enterAnnotationTypeDeclaration = (ctx: AnnotationTypeDeclarationContext): void => {
        this.pushNewScope(AnnotationSymbol, ctx.identifier().text, ctx);
    };

    public exitAnnotationTypeDeclaration = (): void => {
        this.symbolStack.pop();
    };

    public enterEnumDeclaration = (ctx: EnumDeclarationContext): void => {
        const symbol = this.pushNewScope(EnumSymbol, ctx.identifier().text, ctx);
        if (this.enumSymbol) {
            symbol.extends.push(this.enumSymbol);
            symbol.modifiers.add(Modifier.Static);
        }
    };

    public exitEnumConstant = (ctx: EnumConstantContext): void => {
        const block = this.symbolStack.peek();
        this.symbolTable.addNewSymbolOfType(EnumConstantSymbol, block, ctx.identifier().text);
    };

    public exitEnumDeclaration = (): void => {
        this.symbolStack.pop();
    };

    public enterExpression = (ctx: ExpressionContext): void => {
        // Pushing an own symbol for an expression gives us an anchor point for symbol search also with
        // references to higher scopes.
        this.pushNewScope(BlockSymbol, "#expression#", ctx);
    };

    public exitExpression = (): void => {
        this.symbolStack.pop();
    };

    public enterEnhancedForControl = (ctx: EnhancedForControlContext): void => {
        const block = this.symbolStack.peek();

        if (ctx.typeType()) {
            // Explicit type.
            const type = this.generateTypeRecord(ctx.typeType()!.text);

            const id = ctx.variableDeclaratorId().identifier().text;
            const symbol = this.symbolTable.addNewSymbolOfType(VariableSymbol, block, id, undefined, type);
            symbol.context = ctx;
        } else {
            // Auto type.
            const id = ctx.variableDeclaratorId().identifier().text;
            const symbol = this.symbolTable.addNewSymbolOfType(VariableSymbol, block, id, undefined);
            symbol.context = ctx;
        }
    };

    public enterLocalVariableDeclaration = (ctx: LocalVariableDeclarationContext): void => {
        const block = this.symbolStack.peek();
        const type = this.generateTypeRecord(ctx.typeType().text);
        ctx.variableDeclarators().variableDeclarator().forEach((declarator) => {
            const id = declarator.variableDeclaratorId().identifier().text;
            const symbol = this.symbolTable.addNewSymbolOfType(VariableSymbol, block, id, undefined, type);
            symbol.context = declarator;
            this.checkStatic(symbol);
        });
    };

    public enterFieldDeclaration = (ctx: FieldDeclarationContext): void => {
        const block = this.symbolStack.peek();

        const type = this.generateTypeRecord(ctx.typeType().text);
        ctx.variableDeclarators().variableDeclarator().forEach((declarator) => {
            const id = declarator.variableDeclaratorId().identifier().text;
            const symbol = this.symbolTable.addNewSymbolOfType(FieldSymbol, block, id, undefined, type);
            symbol.context = declarator;
            this.checkStatic(symbol);
        });
    };

    public enterConstantDeclarator = (ctx: ConstantDeclaratorContext): void => {
        const block = this.symbolStack.peek();

        const symbol = this.symbolTable.addNewSymbolOfType(FieldSymbol, block, ctx.identifier().text, undefined);
        symbol.context = ctx;
    };

    public enterFormalParameter = (ctx: FormalParameterContext): void => {
        const block = this.symbolStack.peek();

        const type = this.generateTypeRecord(ctx.typeType().text);
        const id = ctx.variableDeclaratorId().identifier().text;
        const symbol = this.symbolTable.addNewSymbolOfType(ParameterSymbol, block, id, undefined, type);
        symbol.context = ctx;
        this.checkStatic(symbol);
    };

    public enterCatchClause = (ctx: CatchClauseContext): void => {
        const block = this.pushNewScope(BlockSymbol, "#catch#", ctx);

        const type = this.generateTypeRecord(ctx.catchType().text); // Can be a union type, but we ignore that here.
        const id = ctx.identifier().text;
        const symbol = this.symbolTable.addNewSymbolOfType(ParameterSymbol, block, id, undefined, type);
        symbol.context = ctx;
    };

    public exitCatchClause = (): void => {
        this.symbolStack.pop();
    };

    public enterSwitchBlockStatementGroup = (ctx: SwitchBlockStatementGroupContext): void => {
        this.pushNewScope(SwitchBlockGroup, "#switchBlockGroup", ctx);
    };

    public exitSwitchBlockStatementGroup = (): void => {
        this.symbolStack.pop();
    };

    public visitTerminal = (_node: TerminalNode): void => { /**/ };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private pushNewScope = <T extends ScopedSymbol>(t: new (...args: any[]) => T, name: string,
        ctx?: ParserRuleContext): T => {
        const parent = this.symbolStack.size() === 0 ? undefined : this.symbolStack.peek();

        const symbol = this.symbolTable.addNewSymbolOfType(t, parent, name, [], []);
        symbol.context = ctx;

        this.symbolStack.push(symbol);

        return symbol;
    };

    /**
     * Checks if the symbol is static and marks it as such, if that's the case.
     *
     * @param symbol The symbol to check.
     */
    private checkStatic = (symbol: BaseSymbol): void => {
        let found = false;
        let run: ParserRuleContext | undefined = symbol.context as ParserRuleContext;
        while (run && !found) {
            switch (run.ruleIndex) {
                case JavaParser.RULE_typeDeclaration: {
                    (run as TypeDeclarationContext).classOrInterfaceModifier().forEach((modifier) => {
                        if (modifier.STATIC()) {
                            symbol.modifiers.add(Modifier.Static);
                        }
                    });

                    found = true;
                    break;
                }

                case JavaParser.RULE_classBodyDeclaration: {
                    (run as ClassBodyDeclarationContext).modifier().forEach((modifier) => {
                        if (modifier.classOrInterfaceModifier() && modifier.classOrInterfaceModifier()!.STATIC()) {
                            symbol.modifiers.add(Modifier.Static);
                        }
                    });

                    found = true;
                    break;
                }

                case JavaParser.RULE_interfaceBodyDeclaration: {
                    (run as InterfaceBodyDeclarationContext).modifier().forEach((modifier) => {
                        if (modifier.classOrInterfaceModifier() && modifier.classOrInterfaceModifier()!.STATIC()) {
                            symbol.modifiers.add(Modifier.Static);
                        }
                    });

                    found = true;
                    break;
                }

                case JavaParser.RULE_interfaceMethodDeclaration: {
                    (run as InterfaceMethodDeclarationContext).interfaceMethodModifier().forEach((modifier) => {
                        if (modifier.STATIC()) {
                            symbol.modifiers.add(Modifier.Static);
                        }
                    });

                    found = true;
                    break;
                }

                default: {
                    run = run.parent;
                    break;
                }
            }
        }
    };

    private generateTypeRecord = (typeText: string): Type => {
        const typeParamsCheck = typeText.match(/^[A-Z_.]+[ \t]*(<.+>)/i);
        let baseText = typeText;
        if (typeParamsCheck) {
            baseText = typeText.substring(0, typeText.length - typeParamsCheck[1].length);
        }

        const kind = JavaParseTreeWalker.typeKindMap.get(baseText) ?? TypeKind.Unknown;

        return {
            name: typeText,
            baseTypes: [],
            kind,
            reference: ReferenceKind.Irrelevant,
        };
    };

}

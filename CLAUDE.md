# CLAUDE.md - AI Assistant Guide

## Overview

This file serves as a comprehensive guide for AI assistants (like Claude) working with this repository. It contains essential information about the codebase structure, development workflows, conventions, and best practices.

**Last Updated**: 2025-11-15
**Repository**: PetreSebastian/yce
**Status**: 🚧 New Repository - Documentation will be updated as the project develops

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Codebase Structure](#codebase-structure)
3. [Technology Stack](#technology-stack)
4. [Development Setup](#development-setup)
5. [Development Workflows](#development-workflows)
6. [Code Conventions](#code-conventions)
7. [Testing Strategy](#testing-strategy)
8. [Git Workflow](#git-workflow)
9. [AI Assistant Guidelines](#ai-assistant-guidelines)
10. [Common Tasks](#common-tasks)
11. [Troubleshooting](#troubleshooting)

---

## Project Overview

### Purpose
<!-- TODO: Add project purpose and description -->

### Key Features
<!-- TODO: List main features and capabilities -->

### Architecture
<!-- TODO: Describe overall architecture and design patterns -->

---

## Codebase Structure

```
yce/
├── .git/                 # Git repository metadata
└── CLAUDE.md            # This file - AI assistant guide
```

### Directory Breakdown

<!-- TODO: Update this section as directories are added -->

**To be populated as the project develops:**

```
├── src/                 # Source code
├── tests/               # Test files
├── docs/                # Documentation
├── config/              # Configuration files
├── scripts/             # Build and utility scripts
├── public/              # Public assets (if web project)
└── dist/                # Build output (gitignored)
```

### Key Files

<!-- TODO: Document important files as they are created -->

- `CLAUDE.md` - This file, AI assistant guide
- `README.md` - (To be created) User-facing documentation
- `package.json` / `requirements.txt` / etc. - (To be created) Dependency management

---

## Technology Stack

### Core Technologies
<!-- TODO: List primary languages, frameworks, and platforms -->

**Example structure:**
- **Language**: TypeScript / Python / JavaScript / Go / etc.
- **Framework**: React / Express / Django / etc.
- **Runtime**: Node.js / Python / etc.
- **Database**: PostgreSQL / MongoDB / etc.

### Development Tools
<!-- TODO: List development dependencies -->

**Example tools:**
- **Package Manager**: npm / yarn / pip / etc.
- **Build Tool**: Webpack / Vite / etc.
- **Linter**: ESLint / Pylint / etc.
- **Formatter**: Prettier / Black / etc.
- **Testing**: Jest / Pytest / etc.

---

## Development Setup

### Prerequisites
<!-- TODO: List required software and versions -->

**Example:**
- Node.js >= 18.0.0
- npm >= 9.0.0
- Git >= 2.30.0

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd yce

# Install dependencies
# TODO: Add appropriate installation commands
# npm install
# pip install -r requirements.txt
# etc.

# Set up environment
# TODO: Add environment setup steps
# cp .env.example .env
# etc.
```

### Environment Variables
<!-- TODO: Document required environment variables -->

**Example:**
```
DATABASE_URL=          # Database connection string
API_KEY=               # API key for external services
PORT=                  # Server port (default: 3000)
```

---

## Development Workflows

### Starting Development Server

```bash
# TODO: Add development server command
# npm run dev
# python manage.py runserver
# etc.
```

### Building for Production

```bash
# TODO: Add build command
# npm run build
# python setup.py build
# etc.
```

### Running Tests

```bash
# TODO: Add test commands
# npm test
# pytest
# etc.
```

### Code Quality Checks

```bash
# TODO: Add linting and formatting commands
# npm run lint
# npm run format
# flake8
# black .
# etc.
```

---

## Code Conventions

### Style Guide

<!-- TODO: Document coding standards -->

**General Principles:**
- Write clear, self-documenting code
- Follow the single responsibility principle
- Keep functions small and focused
- Use meaningful variable and function names
- Add comments for complex logic only

### File Organization

<!-- TODO: Document file naming and organization patterns -->

**Naming Conventions:**
- Files: `kebab-case.js`, `snake_case.py`, etc.
- Components: `PascalCase.tsx`
- Classes: `PascalCase`
- Functions: `camelCase` or `snake_case`
- Constants: `UPPER_SNAKE_CASE`

### Code Patterns

<!-- TODO: Document common patterns used in the codebase -->

**Example patterns:**
- Error handling: Try-catch blocks, error boundaries, etc.
- State management: Context, Redux, etc.
- API calls: Async/await, fetch wrappers, etc.
- Component structure: Hooks, composition, etc.

### Comments and Documentation

- Use JSDoc / docstrings for public APIs
- Explain "why" not "what" in comments
- Keep comments up-to-date with code changes
- Document complex algorithms and business logic

---

## Testing Strategy

### Test Types

<!-- TODO: Document testing approach -->

**Example structure:**
- **Unit Tests**: Test individual functions and components
- **Integration Tests**: Test interactions between modules
- **E2E Tests**: Test complete user workflows
- **Performance Tests**: Test speed and resource usage

### Test Organization

```
tests/
├── unit/              # Unit tests
├── integration/       # Integration tests
├── e2e/              # End-to-end tests
└── fixtures/         # Test data and mocks
```

### Writing Tests

<!-- TODO: Add testing guidelines -->

**Best Practices:**
- Write tests before or alongside code (TDD/BDD)
- Use descriptive test names
- Follow AAA pattern: Arrange, Act, Assert
- Keep tests independent and isolated
- Mock external dependencies

---

## Git Workflow

### Branch Strategy

**Branch Naming Convention:**
- `main` / `master` - Production-ready code
- `develop` - Development branch
- `feature/<name>` - New features
- `fix/<name>` - Bug fixes
- `hotfix/<name>` - Urgent production fixes
- `claude/<session-id>` - AI-generated branches

### Commit Messages

Follow conventional commits format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Example:**
```
feat(auth): add OAuth2 authentication

Implement OAuth2 flow with Google and GitHub providers.
Includes token refresh and session management.

Closes #123
```

### Pull Request Process

1. Create a feature branch from `develop` (or `main`)
2. Make your changes with clear, atomic commits
3. Write/update tests for your changes
4. Ensure all tests pass and code is linted
5. Create a pull request with a clear description
6. Request review from maintainers
7. Address review feedback
8. Merge after approval

---

## AI Assistant Guidelines

### When Working with This Repository

**DO:**
- ✅ Read this CLAUDE.md file first before making changes
- ✅ Follow established code conventions and patterns
- ✅ Write tests for new functionality
- ✅ Update documentation when making changes
- ✅ Use meaningful commit messages
- ✅ Ask for clarification when requirements are unclear
- ✅ Verify changes work before committing
- ✅ Keep security best practices in mind (no secrets in code, validate inputs, etc.)
- ✅ Prefer editing existing files over creating new ones
- ✅ Use the project's existing dependencies and patterns

**DON'T:**
- ❌ Push directly to `main` or `master` without approval
- ❌ Commit secrets, API keys, or sensitive data
- ❌ Make breaking changes without discussion
- ❌ Skip tests or quality checks
- ❌ Introduce unnecessary dependencies
- ❌ Create files that duplicate existing functionality
- ❌ Ignore existing code patterns and conventions
- ❌ Make assumptions about unclear requirements

### Code Quality Checklist

Before committing code, verify:

- [ ] Code follows project conventions
- [ ] Tests are written and passing
- [ ] No linting errors
- [ ] Documentation is updated
- [ ] No sensitive data in code
- [ ] Security best practices followed
- [ ] Error handling is robust
- [ ] Performance is acceptable
- [ ] Changes are minimal and focused

### Security Considerations

Always check for:
- **Input Validation**: Validate and sanitize all user inputs
- **Authentication/Authorization**: Verify permissions properly
- **SQL Injection**: Use parameterized queries
- **XSS**: Escape output, use CSP headers
- **CSRF**: Use CSRF tokens for state-changing operations
- **Secrets Management**: Never commit secrets; use environment variables
- **Dependency Security**: Keep dependencies updated
- **Error Messages**: Don't leak sensitive information in errors

### Common Pitfalls to Avoid

1. **Over-engineering**: Keep solutions simple and maintainable
2. **Premature Optimization**: Optimize only when needed
3. **Tight Coupling**: Maintain loose coupling between modules
4. **Ignoring Edge Cases**: Test boundary conditions
5. **Poor Error Handling**: Handle errors gracefully
6. **Inconsistent Naming**: Follow established conventions
7. **Magic Numbers**: Use named constants
8. **Deep Nesting**: Refactor complex nested logic

---

## Common Tasks

### Adding a New Feature

1. Create a feature branch: `git checkout -b feature/feature-name`
2. Implement the feature following code conventions
3. Write tests for the new functionality
4. Update documentation as needed
5. Commit with a descriptive message
6. Push and create a pull request

### Fixing a Bug

1. Create a fix branch: `git checkout -b fix/bug-description`
2. Write a failing test that reproduces the bug
3. Fix the bug
4. Verify the test now passes
5. Commit and push

### Refactoring Code

1. Ensure comprehensive test coverage exists
2. Make incremental changes
3. Run tests after each change
4. Commit frequently with clear messages
5. Document significant architectural changes

### Updating Dependencies

```bash
# TODO: Add dependency update commands
# npm outdated
# npm update
# pip list --outdated
# pip install --upgrade <package>
```

### Running Migrations

<!-- TODO: Add migration commands if applicable -->

```bash
# Example for database migrations
# npm run migrate
# python manage.py migrate
# etc.
```

---

## Troubleshooting

### Common Issues

<!-- TODO: Document common problems and solutions -->

**Issue**: Development server won't start
**Solution**: Check if port is already in use, verify dependencies are installed

**Issue**: Tests failing
**Solution**: Clear cache, reinstall dependencies, check environment variables

**Issue**: Build errors
**Solution**: Verify Node/Python version, check for syntax errors, clean build directory

### Debug Mode

<!-- TODO: Add debugging instructions -->

```bash
# Enable debug logging
# DEBUG=* npm run dev
# python manage.py runserver --debug
```

### Getting Help

- Check existing issues on GitHub
- Review documentation and README
- Ask in project discussions/chat
- Contact maintainers

---

## Maintenance Notes

### Updating This Guide

This CLAUDE.md file should be updated when:
- Project structure changes significantly
- New conventions or patterns are adopted
- Development workflows are modified
- New tools or dependencies are added
- Common issues and solutions are identified

### Version History

- **2025-11-15**: Initial creation for empty repository
- <!-- Add future updates here -->

---

## Additional Resources

### Documentation Links
<!-- TODO: Add links to relevant documentation -->

- [Project README](./README.md) - (To be created)
- [API Documentation](#) - (To be added)
- [Contributing Guide](#) - (To be added)
- [Changelog](#) - (To be added)

### External Resources
<!-- TODO: Add links to framework docs, style guides, etc. -->

- Language/Framework Official Documentation
- Style Guides
- Best Practices
- Tutorial Resources

---

## Notes for Future Development

This is a new repository. As the project develops, update this guide with:

1. **Actual project details** replacing the TODO sections
2. **Real code examples** showing project-specific patterns
3. **Specific commands** for your chosen tech stack
4. **Team conventions** that emerge during development
5. **Lessons learned** from development experience

**Remember**: This file is a living document. Keep it current as the project evolves!

---

*Generated for AI assistant guidance. Maintained by the development team.*

<?php

declare(strict_types=1);

namespace Tests;

/**
 * Base class for suite classes that want the shared setup without inheriting it into the
 * global namespace. Kept deliberately empty: the runner instantiates each test class and
 * calls its `test*` methods, so there is nothing to inherit except a place to put helpers.
 */
abstract class TestCase
{
}

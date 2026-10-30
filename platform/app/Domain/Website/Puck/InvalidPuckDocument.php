<?php

declare(strict_types=1);

namespace App\Domain\Website\Puck;

use InvalidArgumentException;

/**
 * Thrown when a document cannot be saved.
 *
 * Carries one message per problem rather than the first one, because the editor shows them all
 * at once: fixing a page one error per save is how a builder gets abandoned.
 */
final class InvalidPuckDocument extends InvalidArgumentException
{
    /**
     * @param  list<string>  $errors
     */
    public function __construct(
        public readonly array $errors,
    ) {
        parent::__construct($errors === [] ? 'The document is not valid.' : $errors[0]);
    }

    /** @param  list<string>  $errors */
    public static function because(array $errors): self
    {
        return new self($errors);
    }
}

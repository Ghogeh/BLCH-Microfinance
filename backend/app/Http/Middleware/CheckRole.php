<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * CheckRole Middleware
 *
 * Gates endpoints by user role. Applied as:
 *   Route::middleware('auth:sanctum')->middleware('role:lender')
 *   Route::middleware(['auth:sanctum', 'role:officer,admin'])
 *
 * Roles must match exactly the values in users.role ENUM:
 *   entrepreneur | lender | officer | regulator | admin
 */
class CheckRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['error' => 'Unauthenticated.'], 401);
        }

        // Blacklisted users are blocked from ALL actions except viewing
        // their own profile — additional check beyond role
        if ($user->blacklisted && !$request->routeIs('users.me')) {
            return response()->json([
                'error' => 'Your wallet has been blacklisted per CEMAC 2026 Regulation. Contact your MFI.'
            ], 403);
        }

        if (!in_array($user->role, $roles)) {
            return response()->json([
                'error'         => 'Insufficient role for this action.',
                'required_role' => $roles,
                'your_role'     => $user->role,
            ], 403);
        }

        return $next($request);
    }
}

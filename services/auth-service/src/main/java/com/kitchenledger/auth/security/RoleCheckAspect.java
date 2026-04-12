package com.kitchenledger.auth.security;

import com.kitchenledger.auth.exception.AccessDeniedException;
import jakarta.servlet.http.HttpServletRequest;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Arrays;

@Aspect
@Component
public class RoleCheckAspect {

    @Before("@annotation(RequiresRole)")
    public void checkRole(JoinPoint joinPoint) {
        MethodSignature sig = (MethodSignature) joinPoint.getSignature();
        RequiresRole annotation = sig.getMethod().getAnnotation(RequiresRole.class);
        String[] allowedRoles = annotation.value();

        ServletRequestAttributes attrs =
            (ServletRequestAttributes) RequestContextHolder.currentRequestAttributes();
        HttpServletRequest request = attrs.getRequest();

        String userRole = request.getHeader("x-user-role");
        if (userRole == null || !Arrays.asList(allowedRoles).contains(userRole)) {
            throw new AccessDeniedException(
                "Role '" + userRole + "' is not permitted. Required: "
                + Arrays.toString(allowedRoles)
            );
        }
    }
}
